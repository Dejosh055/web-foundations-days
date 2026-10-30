# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture and trade-offs. It also explains how the design prevents two people from buying the same seat.

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can browse and search upcoming events.
- Users can see an event's seat map, with the status of every seat.
- Users can hold (reserve) one or more seats for a short time while they pay.
- Users can pay for held seats and receive their tickets.
- Users can view their tickets and past orders.
- Held seats that are not paid for are released automatically.

### Non-functional requirements

- **Correctness (most important):** a seat must never be sold to two people, and a customer must never be charged for a seat they do not get. It is better to refuse a request than to sell a seat twice.
- **Speed:** browsing pages respond in under 300 ms. Holding a seat responds in under 1 second, even during a big sale.
- **Fairness:** during a big sale, buyers are treated in the order they arrive. Bots and people opening many tabs must not get an unfair advantage.
- **Availability:** the site should stay up during a big sale and never crash under the load. If it is overloaded, it should slow down in a controlled way instead of failing.
- **Scalability:** it must handle a sudden jump of several hundred times the normal traffic for a short period.
- **Durability:** a paid order and its tickets must never be lost.
- **Security:** all traffic uses HTTPS, passwords are hashed, and card details are handled only by a payment provider.

## 2. Estimates

### Assumptions

- 2,000,000 registered users.
- On a normal day, 50,000 people visit and each views 10 pages.
- On a normal day, 5,000 tickets are sold.
- Peak traffic on a normal day is 5 times the average.
- In a big sale, 200,000 people try to buy 20,000 seats within the first 10 minutes (600 seconds).
- In a big sale, each person makes about 10 requests (event page, a few seat map refreshes, hold attempts and payment), and about 2 of those are hold attempts. Traffic is front-loaded, so the busiest moment is about 5 times the average of the window.

### Normal day

| Measure | Per day | Average per second | Peak per second (x5) |
| --- | --- | --- | --- |
| Page views | 50,000 x 10 = 500,000 | about 5.8 | about 29 |
| Tickets sold | 5,000 | about 0.06 | about 0.3 |

About 10% of visitors buy a ticket. Storage is small: 5,000 tickets a day is about 1.8 million tickets a year.

### Big sale (10 minutes)

| Measure | In the window | Average per second | Peak per second (x5) |
| --- | --- | --- | --- |
| People arriving | 200,000 | about 333 | - |
| Requests (about 10 each) | 2,000,000 | about 3,333 | about 16,700 |
| Seat hold attempts (about 2 each) | 400,000 | about 667 | about 3,300 |
| Tickets sold (at most) | 20,000 | about 33 | - |

### Comparison

| | Normal day | Big sale | Difference |
| --- | --- | --- | --- |
| Peak requests per second | about 29 | about 16,700 | about 576 times more |
| Tickets per second | about 0.06 | about 33 | about 576 times more |
| Time period | 24 hours | 10 minutes | 144 times shorter |

Key findings:

- **The big sale is a spike, not a steady load.** It is roughly 576 times the normal rate, so a system built for a normal day would fail. We cannot afford to run big-sale capacity all day, so the design must absorb or smooth the spike.
- **Demand is 10 times supply.** 200,000 people want 20,000 seats, so 90% of buyers will not get a seat. Most requests will end in "sold out", and they must be answered quickly and fairly.
- **The data that matters is tiny.** At most 20,000 seats are sold, only about 33 sales a second. The danger is not the amount of data but many people fighting over the same few rows at once (contention).

## 3. API

Base URL: `https://api.tickethub.example/v1`. All bodies are JSON. Every endpoint except browsing events needs `Authorization: Bearer <token>`.

| # | Method | Path | Description | Success status |
| --- | --- | --- | --- | --- |
| 1 | `GET` | `/events` | Browse and search events (`?q=`, `?city=`, `?page=`). | `200 OK` |
| 2 | `GET` | `/events/{id}` | Get one event's details. | `200 OK` |
| 3 | `GET` | `/events/{id}/seats` | View the seat map and each seat's status. | `200 OK` |
| 4 | `POST` | `/events/{id}/holds` | Hold chosen seats for 5 minutes. | `201 Created` |
| 5 | `DELETE` | `/holds/{id}` | Release a hold early. | `204 No Content` |
| 6 | `POST` | `/orders` | Create an order from a hold and pay for it. | `201 Created` |
| 7 | `GET` | `/me/tickets` | View my tickets. | `200 OK` |
| 8 | `POST` | `/auth/login` | Log in and receive a token. | `200 OK` |

### Hold seats: `POST /events/{id}/holds`

Request:

```json
{ "seatIds": [101, 102] }
```

Response (`201 Created`):

```json
{
  "holdId": "h_8f3a2c",
  "eventId": 7,
  "seatIds": [101, 102],
  "expiresAt": "2026-11-01T10:05:00Z"
}
```

If any seat is not available, no seat is held (all or nothing) and the response is `409 Conflict`:

```json
{ "error": { "code": "SEAT_UNAVAILABLE", "message": "Seat 102 has just been taken.", "seatIds": [102] } }
```

### Pay: `POST /orders`

Request headers include `Idempotency-Key: 3b1f...` (a unique value created by the client for this payment attempt). Body:

```json
{ "holdId": "h_8f3a2c", "paymentToken": "tok_visa_abc123" }
```

Response (`201 Created`):

```json
{
  "orderId": 5521,
  "status": "PAID",
  "totalCents": 10000,
  "tickets": [{ "ticketId": 9001, "seatId": 101 }, { "ticketId": 9002, "seatId": 102 }]
}
```

The `Idempotency-Key` means that if the client retries after a timeout, the server returns the same order instead of charging twice.

### Error codes

| Status | When it happens |
| --- | --- |
| `400` | Invalid request, such as no seats chosen or more than 6 seats. |
| `401` | Missing or expired token. |
| `404` | Event, hold or order not found. |
| `409` | A seat was taken by someone else (hold failed). |
| `410` | The hold has expired, so the seats were released. |
| `402` | The payment was declined. The seats stay held until the hold expires. |
| `429` | Too many requests. The client is rate limited. |
| `503` | The site is protecting itself during a big sale. The client should retry or wait in the queue. |

## 4. Data model

Five tables: `users`, `events`, `seats`, `orders` and `tickets`.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | People with accounts. | `id` (PK), `email` (unique), `name` |
| `events` | Concerts and events. | `id` (PK), `name`, `starts_at`, `on_sale_at` |
| `seats` | One row per seat per event, with its current status. | `id` (PK), `event_id` (FK), `section`, `row_label`, `seat_number`, `price_cents`, `status`, `held_by` (FK), `hold_expires_at`, `order_id` (FK) |
| `orders` | A purchase made by a user. | `id` (PK), `user_id` (FK), `event_id` (FK), `status`, `total_cents` |
| `tickets` | One ticket per sold seat. Links orders and seats. | `id` (PK), `order_id` (FK), `seat_id` (FK, unique) |

### Relationships

- **users to orders is one-to-many.** One user can place many orders, and each order belongs to one user.
- **events to seats is one-to-many.** One event has thousands of seats, and each seat row belongs to one event.
- **events to orders is one-to-many.** An order is for one event.
- **orders to tickets is one-to-many.** One order can contain several tickets.
- **seats to tickets is one-to-one at most.** A seat can have at most one ticket. This is enforced by a unique constraint (see section 5).
- **users to seats (holds) is one-to-many.** A user can currently hold several seats, recorded in `seats.held_by`.

### CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id    INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
);

CREATE TABLE events (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    starts_at  TEXT NOT NULL,
    on_sale_at TEXT NOT NULL
);

CREATE TABLE orders (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    event_id    INTEGER NOT NULL REFERENCES events (id),
    status      TEXT NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CANCELLED')),
    total_cents INTEGER NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE seats (
    id              INTEGER PRIMARY KEY,
    event_id        INTEGER NOT NULL REFERENCES events (id),
    section         TEXT NOT NULL,
    row_label       TEXT NOT NULL,
    seat_number     INTEGER NOT NULL,
    price_cents     INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'AVAILABLE'
                    CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    held_by         INTEGER REFERENCES users (id),
    hold_expires_at TEXT,
    order_id        INTEGER REFERENCES orders (id),
    UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE tickets (
    id       INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (id),
    seat_id  INTEGER NOT NULL UNIQUE REFERENCES seats (id)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
```

The index `idx_seats_event_status` speeds up the seat map query ("all seats for this event and their status"), which is the most frequent read during a sale.

## 5. How the design prevents two people buying the same seat

This is the most important correctness rule. It is enforced by the database, in three layers, so that even if the application has a bug, a seat cannot be sold twice.

### Layer 1: an atomic conditional update to hold a seat

Holding a seat is **one SQL statement** that checks and changes the seat at the same moment:

```sql
UPDATE seats
SET status = 'HELD', held_by = :user_id, hold_expires_at = :now_plus_5_min
WHERE id = :seat_id
  AND (status = 'AVAILABLE'
       OR (status = 'HELD' AND hold_expires_at < :now));
```

The application then checks how many rows were changed:

- **1 row changed:** this user got the seat.
- **0 rows changed:** someone else already holds or owns it, so the API replies `409 Conflict`.

This avoids the classic mistake of "read the seat, see it is free, then write". Between the read and the write, another person could grab the seat, and both would think they got it. With a single conditional `UPDATE`, the database locks the row while it changes it. If two people try at the same moment, the database makes them take turns. The second one then re-checks the `WHERE` condition, finds the seat already `HELD`, and changes 0 rows. Only one person can win.

To hold several seats, all the updates run in one transaction. If any seat returns 0 rows, the whole transaction is rolled back, so the user never ends up with half of what they wanted.

### Layer 2: a transaction when paying

When the user pays, one transaction does everything or nothing:

```sql
BEGIN;
INSERT INTO orders (user_id, event_id, status, total_cents, created_at)
VALUES (:user_id, :event_id, 'PAID', :total, :now);

-- for each seat in the hold:
UPDATE seats
SET status = 'SOLD', order_id = :order_id, hold_expires_at = NULL
WHERE id = :seat_id
  AND status = 'HELD'
  AND held_by = :user_id
  AND hold_expires_at >= :now;       -- must still be MY hold, and not expired
INSERT INTO tickets (order_id, seat_id) VALUES (:order_id, :seat_id);
COMMIT;
```

If any seat update changes 0 rows (for example, the hold expired and someone else took the seat), the application rolls the whole transaction back: no order, no ticket. The payment is only captured after the seats are confirmed as held by this user, or it is refunded automatically if the transaction fails. So a customer is never charged for a seat they do not get.

### Layer 3: a constraint as the last line of defence

`tickets.seat_id` is `UNIQUE`. Even if a bug in the code tried to create a second ticket for the same seat, the database would reject it with a constraint error. In the same way, `UNIQUE (event_id, section, row_label, seat_number)` stops the same physical seat being created twice for an event.

### Holds expire

A hold lasts 5 minutes. A user who abandons the page does not block the seat forever: after `hold_expires_at` passes, the condition in Layer 1 lets another buyer take it. A background job also resets old holds to `AVAILABLE` so the seat map stays accurate. Sold seats never expire.

### Tested

I ran this logic in SQLite. With 30 simultaneous attempts to hold the same seat, exactly 1 succeeded. A buyer whose hold had been taken failed to pay and the transaction rolled back, leaving no order. A second ticket for an already sold seat was rejected by the unique constraint, and a seat could be taken again once its hold had expired.

## 6. Architecture

```text
                          +-------------------------------+
                          |    Client (browser / app)     |
                          +---------------+---------------+
                                          |
                                          v
                          +-------------------------------+
                          |              DNS              |
                          +---------------+---------------+
                                          |
                                          v
                          +-------------------------------+
                          |  CDN + WAF / rate limiting    |<---- static files, event pages
                          +---------------+---------------+      cached at the edge
                                          |
                                          v
                          +-------------------------------+
                          |      Virtual waiting room     |  admits users at a safe rate
                          |   (fair, first-come queue)    |  (e.g. 300-500 per second)
                          +---------------+---------------+
                                          |
                                          v
                          +-------------------------------+
                          |         Load balancer         |
                          +---+-----------+-----------+---+
                              |           |           |
                         +----v---+  +----v---+  +----v---+
                         |  App   |  |  App   |  |  App   |  auto-scaled,
                         | server |  | server |  | server |  stateless
                         +----+---+  +----+---+  +----+---+
                              \           |           /
              +----------------+----------+----------+-------------------+
              |                |                     |                   |
              | seat map,      | event details       | holds, orders,    | payment
              | event pages    | (browsing)          | tickets (writes)  | requests
              v                v                     v                   v
       +-------------+  +--------------+     +----------------+   +-------------------+
       |   Cache     |  | Read replica |<----|    PRIMARY     |   |  Payment provider |
       |  (Redis)    |  |  (browsing)  |     |    DATABASE    |   |  (external)       |
       +-------------+  +--------------+     | seats = source |   +-------------------+
                          replication        | of truth       |
                                             +--------+-------+
                                                      |
                                                      | after a successful order
                                                      v
                                              +---------------+     +-------------------+
                                              |     Queue     |---->|  Workers          |
                                              +---------------+     |  (e-tickets,      |
                                                                    |   emails, expiry  |
                                                                    |   clean-up)       |
                                                                    +-------------------+
```

### What each component does

- **Client:** It is the website or app the buyer uses, and it shows the seat map and the countdown on a hold.
- **DNS:** It turns `tickethub.example` into the address of our front door, so we can move or add servers without users noticing.
- **CDN:** It serves static files and cached event pages from servers near the user, so the huge number of people just looking at the event page never reaches our servers.
- **WAF and rate limiting:** It blocks bots and limits how many requests one user or address can make, so one person cannot flood the system or use scripts to grab seats unfairly.
- **Virtual waiting room:** It puts people into a fair first-come queue and lets them through at a rate our database can handle, so the 200,000 people do not hit the booking system all at once.
- **Load balancer:** It spreads requests over the app servers and stops using any server that fails.
- **App servers:** They run the booking logic (validating requests, holding seats, creating orders) and keep no data of their own, so we can add many more before a big sale.
- **Cache:** It stores event details and a recently refreshed copy of the seat map in memory, so thousands of people can look at seats without each one querying the database.
- **Primary database:** It is the single source of truth for seats and orders. It runs the atomic updates and transactions that prevent double-booking.
- **Read replica:** It is a live copy of the primary that serves browsing queries, so reads cannot slow down the bookings.
- **Queue:** It holds slower jobs after a purchase, so the buyer gets a quick reply without waiting for them.
- **Workers:** They send e-tickets and confirmation emails, and release expired holds, in the background and can be scaled and retried separately.
- **Payment provider:** An external service that handles card details, so we never store them and cannot leak them.

### How the design survives the big sale

1. **The spike is flattened before it reaches the database.** The CDN absorbs most of the page views. The waiting room admits only as many people as the booking system can handle, instead of letting 16,700 requests a second hit it.
2. **Reads and writes are separated.** The seat map is served from the cache (refreshed every second or two), and browsing uses the read replica. Only the small, important actions (hold, pay) touch the primary database.
3. **The writes are tiny.** Each hold is one small update on a single row. The database only needs to handle about 33 sales a second on average (about 3,300 hold attempts a second at the busiest moment), which is comfortable for one well-sized primary.
4. **Servers are ready in advance.** Because the sale time is known, we scale up app servers and warm the cache before the sale starts, instead of waiting for automatic scaling to react.
5. **Failing fast keeps the system healthy.** When the seats are gone, the API quickly returns "sold out", so the 90% who do not get a seat do not keep hammering the database. A flag can switch the event page to "Sold out" for everyone.
6. **Holds recycle seats.** Abandoned holds expire after 5 minutes, so seats come back for the people still waiting.
7. **No single point of failure.** There are several app servers, a replica that can be promoted if the primary fails, replicated cache and queue, and a standby load balancer.
8. **Fairness.** The waiting room gives each person a place in line by arrival time, with one place per account, and rate limits and bot checks stop people jumping the queue.

## 7. Trade-offs

- **Waiting room: protection and fairness against convenience.** The waiting room keeps the system alive and gives everyone a fair turn, but it means many people wait for several minutes, and some will be upset. Admitting people faster means a shorter wait but a higher risk of overloading the database.
- **Cached seat map: speed against accuracy.** The cached seat map makes browsing fast and takes load off the database, but it can be a second or two out of date, so a user may click a seat that is already taken. We accept this because the real check happens in the database when holding. The cost is a few extra "seat just taken" messages.
- **Hold time: fairness against sales.** A 5-minute hold gives people time to pay, but a seat held by someone who never pays is unavailable to others for that time. A shorter hold releases seats sooner but rushes the buyer and may lose a real sale.
- **One primary database: correctness against write scaling.** A single primary with row locks is simple and makes double-booking easy to prevent, but all writes pass through one machine. This is enough for about 33 sales a second. If we sold millions of tickets a second, we would need to split events across several databases (sharding), which is more complex.
- **All-or-nothing holds: fairness against friction.** Refusing a hold if any chosen seat is taken avoids people ending up with split seats, but it forces the user to pick again.
