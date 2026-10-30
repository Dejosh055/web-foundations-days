# School Database Design

This database stores which students attend which courses, and the grade each student gets. It has three tables: `students`, `courses` and `enrolments`.

## The tables

### `students`
One row per person who studies at the school.

- `student_id` is the primary key.
- `name` is required (`NOT NULL`).
- `email` is required and `UNIQUE`, so no two students can share an email address.

### `courses`
One row per course the school offers.

- `course_id` is the primary key.
- `title` is required.
- `credits` is required and must be greater than 0.

### `enrolments`
One row for each fact "this student is enrolled on this course". It also holds the grade, because the grade belongs to the pair and not to the student or the course alone.

- `enrolment_id` is the primary key.
- `student_id` is a foreign key to `students`, and `course_id` is a foreign key to `courses`. Both are required, so an enrolment cannot exist without a real student and a real course.
- `grade` is optional (`NULL` until the work is marked) and must be between 0 and 100.
- `UNIQUE (student_id, course_id)` stops the same student enrolling on the same course twice.

## Relationships

- **students to enrolments is one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses to enrolments is one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students to courses is many-to-many.** A student can take many courses, and a course has many students. This is the relationship we really care about.

### Why a join table is needed

A relational table cannot hold a list in a single cell. Without `enrolments`, we would have to put several course ids in one `students` column (for example `"1,2,3"`), which breaks searching, counting and foreign keys. Or we would repeat the student's details on many rows, which wastes space and lets the copies disagree.

The `enrolments` table solves this by turning one many-to-many relationship into two one-to-many relationships. Each enrolment is a single row with a single student and a single course, and it is also the natural place to store the grade.

## Index I would add

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);
```

**Reason:** queries such as "all students on one course" and "number of students per course" search `enrolments` by `course_id`. The `UNIQUE (student_id, course_id)` rule already creates an index that starts with `student_id`, so lookups by student are fast. That index cannot be used efficiently to search by `course_id` alone, so without a new index SQLite would scan the whole table. On a school with many thousands of enrolments, this index keeps course lookups fast.

## SQL or NoSQL?

I would choose a SQL database for this system. The data is naturally structured and connected: students, courses and enrolments follow the same fixed shape and are linked by clear relationships. SQL enforces the rules I care about directly in the database, such as unique emails, no duplicate enrolments, valid grades, and no enrolment for a student or course that does not exist. SQL is also good at the questions a school will ask, such as who is on a course, how many students each course has and who has not enrolled, because JOIN and GROUP BY answer them in a few lines. Grades are important records, so SQL transactions, which guarantee that a change either fully happens or does not happen at all, are a real benefit. A NoSQL document database could suit data with no fixed shape or huge scale, such as activity logs, but nothing here needs that, and its looser structure would push rule-checking into the application code.
