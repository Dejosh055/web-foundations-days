# SnapShare Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from people they follow. This plan estimates the load and describes an architecture that can handle it.

## 1. Assumptions

- 10,000,000 registered users.
- 10% of them are active each day.
- Each active user uploads 1 photo per day.
- Each active user views 50 feed pages per day.
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- A day has 86,400 seconds.
- Peak traffic is 5 times the average.
- Storage is counted in decimal units (1 TB = 1,000,000 MB), and I ignore replication, backups and growth in users.

**Daily active users (DAU)** = 10,000,000 × 10% = **1,000,000**

## 2. Estimates

### Uploads per second

- Uploads per day = 1,000,000 users × 1 photo = 1,000,000
- Average = 1,000,000 ÷ 86,400 ≈ **11.6 uploads/second**
- Peak (×5) ≈ **58 uploads/second**

### Feed views per second

- Feed views per day = 1,000,000 users × 50 pages = 50,000,000
- Average = 50,000,000 ÷ 86,400 ≈ **579 views/second**
- Peak (×5) ≈ **2,894 views/second**

### Photo storage per year

- One photo = 2 MB original + 0.05 MB thumbnail = 2.05 MB
- Per day = 1,000,000 × 2.05 MB = 2.05 TB
- Originals per year = 1,000,000 × 2 MB × 365 = **730 TB**
- Thumbnails per year = 1,000,000 × 0.05 MB × 365 = **18.25 TB**
- **Total ≈ 748 TB per year** (about 0.75 PB)

### Upload bandwidth (extra check)

- Average ≈ 11.6 × 2 MB ≈ 23 MB/s, peak ≈ 116 MB/s of incoming photo data.

## 3. Read-heavy or write-heavy?

**SnapShare is read-heavy.** There are 50 feed views for every upload (50,000,000 reads against 1,000,000 writes per day), so about 50 reads for each write.

What this means for the design:

- **Cache aggressively.** The same feeds and thumbnails are requested again and again, so a cache and a CDN can answer most requests without touching the database.
- **Scale reads separately.** Add read replicas of the database and extra app servers behind a load balancer. Reads can be copied to many places, while writes still go to one primary.
- **Make writes cheap and quick.** Writes are rarer, so we can accept the photo, store it and do the slow work (thumbnails) later in the background.

The one exception is storage volume. Uploads are few, but each photo is large, so storage grows by about 2 TB a day even though the write rate is low.

## 4. Why photos do not belong in the database

Photos should not be stored inside the database. They should go in **object storage** (for example Amazon S3 or a similar service), and the database should store only the photo's key or URL.

- **Size:** About 748 TB a year would bloat the database, slow backups and replication, and make it very expensive to run.
- **Cost:** Database storage is fast and costly. Object storage is built for huge files and costs far less per terabyte.
- **Performance:** Sending 2 MB files through the database would use its memory and connections, which should be kept for small, fast queries.
- **Delivery:** Object storage works directly with a CDN, so photos can be served from servers near the user and never reach our app servers.
- **Scaling:** Object storage grows almost without limit and keeps copies of files automatically.

## 5. Architecture diagram

```text
                          +----------------------------+
                          |   Users (mobile / web)     |
                          +-------------+--------------+
                                        |
                   photos & thumbnails  |  API requests
                  +---------------------+---------------------+
                  v                                           v
          +---------------+                          +-----------------+
          |      CDN      |                          |  Load balancer  |
          |  (edge cache) |                          +--------+--------+
          +-------+-------+                                   |
                  | cache miss                 +--------------+--------------+
                  |                            v              v              v
                  |                       +---------+    +---------+    +---------+
                  |                       |  App    |    |  App    |    |  App    |
                  |                       | server  |    | server  |    | server  |
                  |                       +----+----+    +----+----+    +----+----+
                  |                            \             |             /
                  |                             +------------+------------+
                  |                                          |
                  |            +-----------------------------+--------------------+
                  |            |             |                |                    |
                  |            | feed reads  | writes         | save original      | publish job
                  |            v             v                v                    v
                  |       +---------+   +-----------+    +-----------+        +---------+
                  |       |  Cache  |   | Database  |    |  Object   |        |  Queue  |
                  |       | (Redis) |   |  PRIMARY  |    |  storage  |        +----+----+
                  |       +----+----+   +-----+-----+    |  (photos) |             |
                  |            | miss        |          +-----+-----+             v
                  |            v             | replicates     ^ ^          +--------------+
                  |       +-----------+      |                | |          |  Thumbnail   |
                  |       | Database  |<-----+                | +----------|   worker(s)  |
                  |       | READ REPLICA |                    |  reads      +--------------+
                  |       +-----------+                       |  original,
                  |                                           |  saves thumbnail
                  +-------------------------------------------+
                              (CDN fetches files from object storage)
```

Simplified view of the two main paths:

```text
READ (feed):    User -> CDN -> (miss) Object storage            (photo files)
                User -> Load balancer -> App server -> Cache -> Read replica   (feed data)

WRITE (upload): User -> Load balancer -> App server -> Object storage (original)
                                                    -> Primary DB    (photo record)
                                                    -> Queue -> Worker -> Object storage (thumbnail)
```

## 6. What each component does

- **CDN:** It keeps copies of photos and thumbnails on servers close to users, so images load quickly and most image traffic never reaches our own servers.
- **Load balancer:** It spreads incoming requests across many app servers, so no single server is overloaded and one failing server does not take the app down.
- **App servers:** They run the application logic (login, upload, building the feed) and are stateless, so we can add more of them as traffic grows.
- **Cache:** It holds frequently requested data, such as recent feeds and user profiles, in memory, so most reads skip the slower database.
- **Database (primary):** It stores the structured data (users, follows, photo records, likes) reliably and handles all writes.
- **Read replica:** It is a live copy of the primary that serves read queries, so the heavy read load does not slow down the writes.
- **Object storage:** It stores the large photo files cheaply and durably, so the database stays small and fast.
- **Queue:** It holds background jobs such as "make a thumbnail", so the upload request can finish immediately without waiting for the slow work.
- **Thumbnail worker:** It picks jobs from the queue, creates the 50 KB thumbnail and saves it, so thumbnails are made in the background and can be scaled separately from the app.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps Upload. The request goes through the CDN/DNS to the **load balancer**.
2. The load balancer sends it to one of the **app servers**.
3. The app server checks that the user is logged in and that the file is a valid image within the size limit.
4. The app server saves the original (about 2 MB) in **object storage** under a unique key.
5. The app server writes a row to the **primary database** with the photo id, owner, storage key, upload time and status "processing".
6. The app server puts a "create thumbnail for photo X" job on the **queue**.
7. The app server replies to the user with success straight away ("Upload complete"). The user does not wait for the thumbnail.
8. A **thumbnail worker** takes the job from the queue, reads the original from object storage and resizes it to a 50 KB thumbnail.
9. The worker saves the thumbnail in object storage and updates the photo's row in the database to "ready". If the job fails, it goes back on the queue to be retried.
10. The app server removes the cached feeds of the user's followers (or lets them expire), so the new photo can appear.
11. When followers load their feed, the app returns the photo records from the cache or the read replica, and their devices fetch the thumbnails from the **CDN**.

## 8. Trade-offs

- **Caching: speed against freshness.** The cache and CDN make reads fast and cheap, but a user may briefly see an old feed or a deleted photo until the cached copy expires or is cleared. Shorter expiry times give fresher data but let more traffic through to the database.
- **Read replica: scale against consistency.** The replica takes read load off the primary, but copying data takes a short time (replication lag). A user could upload a photo and not see it right away if their read goes to a replica that is behind. We can send a user's own reads to the primary for a few seconds after they write.
- **Queue and background thumbnails: fast uploads against delayed thumbnails.** The user gets an instant reply, but for a moment the thumbnail does not exist yet. We can show a placeholder until the job finishes. The queue also adds one more system to run and monitor.
- **Storage cost against quality.** Keeping every 2 MB original forever costs about 748 TB a year and growing. We could compress photos, or move old ones to cheaper "cold" storage, but that lowers quality or makes old photos slower to open.

## Summary

| Measure | Average | Peak (×5) |
| --- | --- | --- |
| Daily active users | 1,000,000 | - |
| Uploads per second | 11.6 | 58 |
| Feed views per second | 579 | 2,894 |
| Photo storage per year | about 748 TB (730 TB originals + 18.25 TB thumbnails) | - |

SnapShare is **read-heavy** (50 reads per write), so the design relies on a CDN and cache for reads, a read replica for scale, object storage for photos and a queue for slow background work.
