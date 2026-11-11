# Multi-Model Routing Strategy
- When generating the background task runner, implement a `TaskRouter`.
- Evaluate task complexity statically.
- Route UI/Markdown rendering tasks to the lightweight model pipeline.
- Route Rust backend, SQLite persistence, and Anki algorithm logic to the reasoning model pipeline.
