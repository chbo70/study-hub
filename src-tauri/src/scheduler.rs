use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

/// Output of an Anki SM-2 / FSRS review calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSchedule {
    /// Next review interval in days.
    pub interval: i64,
    /// Updated ease factor (minimum 1.3).
    pub ease: f64,
    /// Consecutive successful repetitions count.
    pub repetitions: i64,
    /// ISO-8601 date string (`YYYY-MM-DD`) for the next scheduled review.
    pub next_review: String,
}

/// Calculates the next review schedule using the Anki SM-2 spaced repetition algorithm.
///
/// `quality` accepts 0..=5 (standard SM-2 grade):
/// - 0..=2: Again / lapsed (resets repetitions to 0, interval to 1 day)
/// - 3: Hard (interval grows modestly, slight ease penalty)
/// - 4: Good (standard SM-2 progression)
/// - 5: Easy (bonus interval and ease increase)
pub fn calculate_sm2_schedule(
    current_interval: i64,
    current_ease: f64,
    current_repetitions: i64,
    quality: u8,
) -> ReviewSchedule {
    let q = quality.min(5) as f64;
    let base_ease = if current_ease < 1.3 { 2.5 } else { current_ease };

    let (repetitions, interval, ease) = if quality < 3 {
        // Failed recall ("Again"): reset repetitions and review tomorrow (interval = 1)
        let new_ease = (base_ease - 0.20).max(1.3);
        (0, 1, new_ease)
    } else {
        let next_reps = current_repetitions + 1;
        let updated_ease = (base_ease + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02))).max(1.3);

        let next_interval = match next_reps {
            1 => 1,
            2 => {
                if quality == 3 {
                    3
                } else if quality == 5 {
                    6
                } else {
                    4
                }
            }
            _ => {
                let prev = current_interval.max(1) as f64;
                let multiplier = if quality == 3 {
                    1.2
                } else if quality == 5 {
                    updated_ease * 1.3
                } else {
                    updated_ease
                };
                (prev * multiplier).round().max(1.0) as i64
            }
        };

        (next_reps, next_interval, (updated_ease * 100.0).round() / 100.0)
    };

    let next_date = (Utc::now() + Duration::days(interval))
        .format("%Y-%m-%d")
        .to_string();

    ReviewSchedule {
        interval,
        ease,
        repetitions,
        next_review: next_date,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sm2_progression() {
        // First review (Good = 4)
        let r1 = calculate_sm2_schedule(0, 2.5, 0, 4);
        assert_eq!(r1.repetitions, 1);
        assert_eq!(r1.interval, 1);
        assert!(r1.ease >= 2.5);

        // Second review (Good = 4)
        let r2 = calculate_sm2_schedule(r1.interval, r1.ease, r1.repetitions, 4);
        assert_eq!(r2.repetitions, 2);
        assert_eq!(r2.interval, 4);

        // Third review (Easy = 5)
        let r3 = calculate_sm2_schedule(r2.interval, r2.ease, r2.repetitions, 5);
        assert_eq!(r3.repetitions, 3);
        assert!(r3.interval > r2.interval);

        // Lapse (Again = 1)
        let lapsed = calculate_sm2_schedule(r3.interval, r3.ease, r3.repetitions, 1);
        assert_eq!(lapsed.repetitions, 0);
        assert_eq!(lapsed.interval, 1);
        assert!(lapsed.ease >= 1.3);
    }
}
