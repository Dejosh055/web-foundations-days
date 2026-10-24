# Library Books API Design

A REST API for a library's `books` resource. All requests and responses use JSON, and every path starts with `/api`.

## The book object

```json
{
  "id": 12,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "year": 1958,
  "available": true
}
```

- `id` is created by the server.
- `title` and `author` are required when creating a book.
- `isbn`, `year` and `available` are optional.

## Endpoints

### 1. List all books

- **Method and path:** `GET /api/books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book

- **Method and path:** `GET /api/books/{id}`
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method and path:** `POST /api/books`
- **Description:** Adds a new book and returns it with its new id.
- **Example request body:**

  ```json
  {
    "title": "Half of a Yellow Sun",
    "author": "Chimamanda Ngozi Adichie",
    "isbn": "9781400095209",
    "year": 2006
  }
  ```

- **Success status:** `201 Created` (with a `Location: /api/books/{id}` header)

### 4. Update a book

- **Method and path:** `PUT /api/books/{id}`
- **Description:** Replaces the whole book with the data sent. Every field must be included.
- **Example request body:**

  ```json
  {
    "title": "Half of a Yellow Sun",
    "author": "Chimamanda Ngozi Adichie",
    "isbn": "9781400095209",
    "year": 2006,
    "available": false
  }
  ```

- **Success status:** `200 OK`

### 5. Delete a book

- **Method and path:** `DELETE /api/books/{id}`
- **Description:** Removes the book with the given id.
- **Request body:** none
- **Success status:** `204 No Content` (empty response body)

### 6. List books by an author

- **Method and path:** `GET /api/books?author={name}`
- **Description:** Returns only the books written by the given author. The author goes in a query parameter, so the same list endpoint can be filtered.
- **Example:** `GET /api/books?author=Chinua%20Achebe`
- **Request body:** none
- **Success status:** `200 OK` (an empty list `[]` if the author has no books)

### 7. Update part of a book (optional)

- **Method and path:** `PATCH /api/books/{id}`
- **Description:** Changes only the fields sent, such as marking a book as borrowed.
- **Example request body:**

  ```json
  { "available": false }
  ```

- **Success status:** `200 OK`

## Summary table

| Action | Method | Path | Success |
| --- | --- | --- | --- |
| List books | GET | `/api/books` | 200 |
| Get one book | GET | `/api/books/{id}` | 200 |
| Create book | POST | `/api/books` | 201 |
| Update book | PUT | `/api/books/{id}` | 200 |
| Delete book | DELETE | `/api/books/{id}` | 204 |
| List by author | GET | `/api/books?author={name}` | 200 |
| Partial update | PATCH | `/api/books/{id}` | 200 |

## Error codes

### 400 Bad Request

The request is invalid, so the server cannot process it. The response explains what is wrong.

- `POST /api/books` with a body that has no `title`.
- `POST /api/books` with a body that is not valid JSON.
- `PUT /api/books/12` where `year` is the text `"nineteen"` instead of a number.
- `GET /api/books/abc`, because the id must be a number.

Example response:

```json
{ "error": "Bad Request", "message": "The field 'title' is required." }
```

### 404 Not Found

The request is valid, but the book it refers to does not exist.

- `GET /api/books/9999` when no book has id 9999.
- `PUT /api/books/9999` to update a book that does not exist.
- `DELETE /api/books/9999` when that book was already deleted.

Example response:

```json
{ "error": "Not Found", "message": "No book with id 9999." }
```

Note: `GET /api/books?author=Nobody` is **not** a 404. The books collection exists, so the server returns `200 OK` with an empty list.
