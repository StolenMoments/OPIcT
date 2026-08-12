const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function addDays(date, days) {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`잘못된 날짜 형식: ${date}`);
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function seoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function selectSessionItems(sentences, today, limit = 5) {
  const due = sentences
    .filter((sentence) => sentence.session_count > 0 && sentence.next_review_on && sentence.next_review_on <= today)
    .sort((a, b) => a.next_review_on.localeCompare(b.next_review_on) || a.id - b.id);
  const unseen = sentences
    .filter((sentence) => sentence.session_count === 0)
    .sort((a, b) => a.id - b.id);
  return [...due, ...unseen].slice(0, limit);
}

export function reviewAfterOutcome(sentence, outcome, today) {
  if (outcome === 'first_try_pass') {
    const firstPassStreak = sentence.first_pass_streak + 1;
    const mastered = sentence.mastery_status === 'mastered' || firstPassStreak >= 2;
    return {
      mastery_status: mastered ? 'mastered' : 'learning',
      first_pass_streak: firstPassStreak,
      next_review_on: addDays(today, mastered ? 14 : 3),
    };
  }
  return {
    mastery_status: 'learning',
    first_pass_streak: 0,
    next_review_on: addDays(today, 1),
  };
}
