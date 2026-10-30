-- School database: students, courses and enrolments (SQLite)

-- SQLite only enforces foreign keys when this is switched on.
PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    title     TEXT NOT NULL,
    credits   INTEGER NOT NULL CHECK (credits > 0)
);

-- Join table: one row = one student enrolled on one course.
CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY,
    student_id   INTEGER NOT NULL,
    course_id    INTEGER NOT NULL,
    grade        INTEGER CHECK (grade BETWEEN 0 AND 100),  -- NULL until marked
    FOREIGN KEY (student_id) REFERENCES students (student_id),
    FOREIGN KEY (course_id)  REFERENCES courses (course_id),
    -- The same student cannot enrol on the same course twice.
    UNIQUE (student_id, course_id)
);

-- ============================================================
-- 2. SAMPLE DATA
-- ============================================================

INSERT INTO students (student_id, name, email) VALUES
    (1, 'Amina Bello',   'amina.bello@school.test'),
    (2, 'Chidi Okafor',  'chidi.okafor@school.test'),
    (3, 'Grace Adeyemi', 'grace.adeyemi@school.test'),
    (4, 'Tunde Balogun', 'tunde.balogun@school.test');  -- no enrolments yet

INSERT INTO courses (course_id, title, credits) VALUES
    (1, 'Web Foundations',  3),
    (2, 'Databases',        4),
    (3, 'JavaScript Basics', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 85),
    (1, 2, 78),
    (2, 1, 64),
    (3, 1, NULL),
    (3, 3, 91),
    (2, 3, NULL);

-- ============================================================
-- 3. QUERIES
-- ============================================================

-- Query 1: all courses for one student (by name)
SELECT c.title, c.credits, e.grade
FROM students AS s
JOIN enrolments AS e ON e.student_id = s.student_id
JOIN courses    AS c ON c.course_id  = e.course_id
WHERE s.name = 'Amina Bello'
ORDER BY c.title;

-- Query 2: all students on one course
SELECT s.name, s.email, e.grade
FROM courses AS c
JOIN enrolments AS e ON e.course_id  = c.course_id
JOIN students   AS s ON s.student_id = e.student_id
WHERE c.title = 'Web Foundations'
ORDER BY s.name;

-- Query 3: number of students per course
-- (LEFT JOIN keeps courses that nobody has joined, with a count of 0)
SELECT c.title, COUNT(e.enrolment_id) AS student_count
FROM courses AS c
LEFT JOIN enrolments AS e ON e.course_id = c.course_id
GROUP BY c.course_id, c.title
ORDER BY student_count DESC, c.title;

-- Query 4: students who have no enrolments
SELECT s.student_id, s.name, s.email
FROM students AS s
LEFT JOIN enrolments AS e ON e.student_id = s.student_id
WHERE e.enrolment_id IS NULL;

-- Query 5: update one enrolment's grade (Grace's Web Foundations grade)
UPDATE enrolments
SET grade = 72
WHERE student_id = (SELECT student_id FROM students WHERE name = 'Grace Adeyemi')
  AND course_id  = (SELECT course_id  FROM courses  WHERE title = 'Web Foundations');

-- Check the update worked
SELECT s.name, c.title, e.grade
FROM enrolments AS e
JOIN students AS s ON s.student_id = e.student_id
JOIN courses  AS c ON c.course_id  = e.course_id
WHERE s.name = 'Grace Adeyemi'
ORDER BY c.title;
