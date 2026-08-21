export function trainingRepo(db) {
  const createItems = db.transaction((sessionId, sentences) => {
    const insert = db.prepare(
      `INSERT INTO training_session_items (session_id,sentence_id,position,status)
       VALUES (?,?,?,'pending')`,
    );
    const markSeen = db.prepare(
      `UPDATE training_sentences
       SET session_count=session_count+1, updated_at=datetime('now') WHERE id=?`,
    );
    sentences.forEach((sentence, index) => {
      insert.run(sessionId, sentence.id, index + 1);
      markSeen.run(sentence.id);
    });
  });

  const completeAnswer = db.transaction((answerId, verdictJson, rawOutput, outcome, review) => {
    const answer = db.prepare(
      `SELECT a.*, i.session_id, i.sentence_id
       FROM training_answers a JOIN training_session_items i ON i.id=a.session_item_id
       WHERE a.id=?`,
    ).get(answerId);
    db.prepare(
      `UPDATE training_answers SET status='done', verdict_json=?, raw_output=?, error_message=NULL,
       completed_at=datetime('now') WHERE id=?`,
    ).run(verdictJson, rawOutput, answerId);
    db.prepare(
      `UPDATE training_session_items SET status='completed', outcome=?, completed_at=datetime('now') WHERE id=?`,
    ).run(outcome, answer.session_item_id);
    db.prepare(
      `UPDATE training_sentences SET mastery_status=?, first_pass_streak=?, next_review_on=?,
       updated_at=datetime('now') WHERE id=?`,
    ).run(review.mastery_status, review.first_pass_streak, review.next_review_on, answer.sentence_id);
    const remaining = db.prepare(
      `SELECT COUNT(*) AS count FROM training_session_items WHERE session_id=? AND status!='completed'`,
    ).get(answer.session_id).count;
    if (remaining === 0) {
      db.prepare(
        `UPDATE training_sessions SET status='completed', completed_at=datetime('now'), error_code=NULL,
         error_message=NULL WHERE id=?`,
      ).run(answer.session_id);
    }
  });

  return {
    listSources(limit = 30) {
      const attempts = db.prepare(
        `SELECT id, 'attempt' AS source_type, transcript AS source_text, result_json, created_at
         FROM attempts WHERE status='done' AND transcript IS NOT NULL AND result_json IS NOT NULL
         ORDER BY id DESC LIMIT ?`,
      ).all(limit);
      const corrections = db.prepare(
        `SELECT id, 'correction' AS source_type, input_text AS source_text, result_json, created_at
         FROM corrections WHERE status='done' AND result_json IS NOT NULL
         ORDER BY id DESC LIMIT ?`,
      ).all(limit);
      return [...attempts, ...corrections]
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .slice(0, limit);
    },
    createSession({ cli, model }) {
      const info = db.prepare(
        `INSERT INTO training_sessions (cli,model,status) VALUES (?,?,'building')`,
      ).run(cli, model);
      return this.getSession(info.lastInsertRowid);
    },
    findActiveSession() {
      return db.prepare(
        `SELECT * FROM training_sessions WHERE status IN ('building','ready','in_progress') ORDER BY id DESC LIMIT 1`,
      ).get();
    },
    getSession(id) {
      return db.prepare('SELECT * FROM training_sessions WHERE id=?').get(id);
    },
    setSessionStatus(id, changes) {
      const allowed = ['status', 'error_code', 'error_message', 'raw_output'];
      const fields = [];
      const values = [];
      for (const field of allowed) {
        if (Object.hasOwn(changes, field)) {
          fields.push(`${field}=?`);
          values.push(changes[field]);
        }
      }
      if (changes.status === 'completed') fields.push("completed_at=datetime('now')");
      values.push(id);
      db.prepare(`UPDATE training_sessions SET ${fields.join(', ')} WHERE id=?`).run(...values);
      return this.getSession(id);
    },
    insertSentence(sentence) {
      db.prepare(
        `INSERT INTO training_sentences
         (source_type,source_id,source_snapshot_json,source_sentence,intent_ko,reference_en,focus_ko,fingerprint)
         VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO NOTHING`,
      ).run(
        sentence.source_type,
        sentence.source_id,
        sentence.source_snapshot_json,
        sentence.source_sentence,
        sentence.intent_ko,
        sentence.reference_en,
        sentence.focus_ko,
        sentence.fingerprint,
      );
    },
    listSentences() {
      return db.prepare('SELECT * FROM training_sentences ORDER BY id').all();
    },
    getSentence(id) {
      return db.prepare('SELECT * FROM training_sentences WHERE id=?').get(id);
    },
    addSessionItems(sessionId, sentences) {
      createItems(sessionId, sentences);
    },
    listSessionItems(sessionId) {
      return db.prepare(
        `SELECT i.*, s.source_type, s.source_id, s.source_sentence, s.intent_ko, s.reference_en,
         s.focus_ko, s.mastery_status
         FROM training_session_items i JOIN training_sentences s ON s.id=i.sentence_id
         WHERE i.session_id=? ORDER BY i.position`,
      ).all(sessionId);
    },
    listItemAnswers(itemId) {
      return db.prepare(
        'SELECT * FROM training_answers WHERE session_item_id=? ORDER BY attempt_no',
      ).all(itemId);
    },
    getItem(id) {
      return db.prepare(
        `SELECT i.*, s.source_type, s.source_id, s.source_sentence, s.intent_ko, s.reference_en,
         s.focus_ko, s.mastery_status, s.first_pass_streak
         FROM training_session_items i JOIN training_sentences s ON s.id=i.sentence_id WHERE i.id=?`,
      ).get(id);
    },
    getCurrentItem(sessionId) {
      return db.prepare(
        `SELECT * FROM training_session_items
         WHERE session_id=? AND status!='completed' ORDER BY position LIMIT 1`,
      ).get(sessionId);
    },
    createAnswer(itemId, answerText, attemptNo) {
      const info = db.prepare(
        `INSERT INTO training_answers (session_item_id,attempt_no,answer_text,status) VALUES (?,?,?,'pending')`,
      ).run(itemId, attemptNo, answerText);
      db.prepare(
        `UPDATE training_session_items SET status=? WHERE id=?`,
      ).run(attemptNo === 1 ? 'grading_first' : 'grading_revision', itemId);
      const item = this.getItem(itemId);
      db.prepare("UPDATE training_sessions SET status='in_progress' WHERE id=? AND status='ready'").run(item.session_id);
      return this.getAnswer(info.lastInsertRowid);
    },
    getAnswer(id) {
      return db.prepare(
        `SELECT a.*, i.status AS item_status, i.session_id, i.sentence_id, s.intent_ko, s.focus_ko,
         s.reference_en, s.mastery_status, s.first_pass_streak
         FROM training_answers a
         JOIN training_session_items i ON i.id=a.session_item_id
         JOIN training_sentences s ON s.id=i.sentence_id WHERE a.id=?`,
      ).get(id);
    },
    setAnswerRunning(id) {
      db.prepare("UPDATE training_answers SET status='running', error_message=NULL WHERE id=?").run(id);
      return this.getAnswer(id);
    },
    markFirstFailure(answerId, verdictJson, rawOutput) {
      const answer = this.getAnswer(answerId);
      const transaction = db.transaction(() => {
        db.prepare(
          `UPDATE training_answers SET status='done', verdict_json=?, raw_output=?, error_message=NULL,
           completed_at=datetime('now') WHERE id=?`,
        ).run(verdictJson, rawOutput, answerId);
        db.prepare("UPDATE training_session_items SET status='awaiting_revision' WHERE id=?")
          .run(answer.session_item_id);
      });
      transaction();
      return this.getAnswer(answerId);
    },
    completeAnswer(answerId, verdictJson, rawOutput, outcome, review) {
      completeAnswer(answerId, verdictJson, rawOutput, outcome, review);
      return this.getAnswer(answerId);
    },
    markAnswerError(answerId, errorMessage, rawOutput) {
      const answer = this.getAnswer(answerId);
      const itemStatus = answer.attempt_no === 1 ? 'first_error' : 'revision_error';
      const transaction = db.transaction(() => {
        db.prepare(
          `UPDATE training_answers SET status='error', raw_output=?, error_message=?, completed_at=NULL WHERE id=?`,
        ).run(rawOutput, errorMessage, answerId);
        db.prepare('UPDATE training_session_items SET status=? WHERE id=?')
          .run(itemStatus, answer.session_item_id);
      });
      transaction();
      return this.getAnswer(answerId);
    },
    retryAnswer(answerId) {
      const answer = this.getAnswer(answerId);
      const itemStatus = answer.attempt_no === 1 ? 'grading_first' : 'grading_revision';
      const transaction = db.transaction(() => {
        db.prepare(
          `UPDATE training_answers SET status='pending', verdict_json=NULL, error_message=NULL,
           completed_at=NULL WHERE id=?`,
        ).run(answerId);
        db.prepare('UPDATE training_session_items SET status=? WHERE id=?')
          .run(itemStatus, answer.session_item_id);
        db.prepare("UPDATE training_sessions SET status='in_progress' WHERE id=?")
          .run(answer.session_id);
      });
      transaction();
      return this.getAnswer(answerId);
    },
    summary(sessionId) {
      return Object.fromEntries(
        db.prepare(
          `SELECT outcome, COUNT(*) AS count FROM training_session_items
           WHERE session_id=? AND outcome IS NOT NULL GROUP BY outcome`,
        ).all(sessionId).map(({ outcome, count }) => [outcome, count]),
      );
    },
    listDrillSentences(limit = 10) {
      // Recency is ordered by training_drill_results.id (strictly monotonic on
      // insert) rather than created_at, since datetime('now') only has
      // second resolution and ties within the same second would otherwise
      // fall back to sentence id instead of true insertion order.
      return db.prepare(
        `SELECT s.*,
           (SELECT MAX(id) FROM training_drill_results d WHERE d.sentence_id=s.id AND d.result='wrong') AS last_wrong_id,
           (SELECT MAX(id) FROM training_drill_results d WHERE d.sentence_id=s.id) AS last_drilled_id
         FROM training_sentences s
         WHERE EXISTS (
           SELECT 1 FROM training_session_items i WHERE i.sentence_id=s.id AND i.status='completed'
         )
         ORDER BY
           CASE WHEN last_wrong_id IS NOT NULL THEN 0 ELSE 1 END,
           last_wrong_id DESC,
           CASE WHEN last_drilled_id IS NULL THEN 0 ELSE 1 END,
           last_drilled_id ASC,
           s.id ASC
         LIMIT ?`,
      ).all(limit);
    },
    countDrillEligible() {
      return db.prepare(
        `SELECT COUNT(*) AS count FROM training_sentences s
         WHERE EXISTS (
           SELECT 1 FROM training_session_items i WHERE i.sentence_id=s.id AND i.status='completed'
         )`,
      ).get().count;
    },
    recordDrillResult({ sentence_id, result, answer_text }) {
      const info = db.prepare(
        `INSERT INTO training_drill_results (sentence_id,result,answer_text) VALUES (?,?,?)`,
      ).run(sentence_id, result, answer_text);
      return db.prepare('SELECT * FROM training_drill_results WHERE id=?').get(info.lastInsertRowid);
    },
  };
}
