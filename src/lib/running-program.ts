// 16-week aerobic program — built to become a sustainable lifelong pattern, not a peak.
//
// Session types:
//   easy         — standard Zone 2 continuous run (conversational, ~60-70% max HR)
//   long         — the week's longer Zone 2 run (same easy effort, more time on feet)
//   interval     — VO2 max work (90-95% max HR, hard but controlled, NEVER a sprint)
//   unstructured — OPTIONAL easy walk or jog. No targets, no progression, no pressure.
//                  Pure aerobic volume + recovery. Skip it freely on a tired week.
//
// Design principles (longevity-first):
//   1. Zone 2 is the engine. We reach continuous running fast (week 3) and let the
//      standard session settle at ~40 min, with one longer 45-75 min run each week.
//   2. VO2 max is kept — it's the most age-defying fitness marker — but it is WAVED,
//      never linearly increased. Every 3-4 weeks intensity is pulled back (reduced
//      intervals or a Zone-2-only week). This is what makes 4×4 work sustainable for
//      years rather than burning out in a season.
//   3. Easy is easy, hard is hard. Hard days (intervals) are clearly separated from
//      easy days so the body actually recovers and adapts.
//   4. The optional unstructured session adds aerobic volume without adding structure
//      or fatigue pressure — it exists to be enjoyable and to be skipped guilt-free.
//   5. Week 16 is not a finish line — it describes the repeating pattern to hold
//      indefinitely.
//
// Zone 2 check: can you hold a full conversation? If not, slow down.
// VO2 check: breathing hard and controlled, could say 3-4 words. Sustainable for the
//            full interval. Not a sprint.

interface RunWeek {
  week: number;
  sessions: {
    session_in_week: number;
    type: "easy" | "interval" | "long" | "unstructured";
    target_duration_min: number;
    target_description: string;
    optional?: boolean;
  }[];
}

export const RUNNING_PROGRAM: RunWeek[] = [
  // ── PHASE 1: Foundation — run/walk → continuous (Weeks 1-3) ──────
  // Returning athlete: we compress run/walk to three weeks and reach near-continuous
  // running by the end of week 3, rather than dragging intervals out for two months.
  {
    week: 1,
    sessions: [
      { session_in_week: 1, type: "easy", target_duration_min: 24, target_description: "2 min run / 1 min walk × 8. Fully conversational on the run portions — if you can't talk in sentences, slow the run down." },
      { session_in_week: 2, type: "easy", target_duration_min: 24, target_description: "2 min run / 1 min walk × 8. Same as session 1. Easy effort — consistency matters far more than pace right now." },
      { session_in_week: 3, type: "easy", target_duration_min: 28, target_description: "3 min run / 1 min walk × 7. Slightly longer run blocks. Keep the effort honest and easy." },
    ],
  },
  {
    week: 2,
    sessions: [
      { session_in_week: 1, type: "easy", target_duration_min: 30, target_description: "5 min run / 1 min walk × 5. You're running far more than walking now. Pace stays slow." },
      { session_in_week: 2, type: "easy", target_duration_min: 30, target_description: "5 min run / 1 min walk × 5. Nose-breathing if you can — a real Zone 2 signal." },
      { session_in_week: 3, type: "easy", target_duration_min: 32, target_description: "8 min run / 1 min walk × 3 (+ easy finish). Run blocks lengthening — continuous running is close." },
    ],
  },
  {
    week: 3,
    sessions: [
      { session_in_week: 1, type: "easy", target_duration_min: 32, target_description: "10 min run / 1 min walk × 3. Almost continuous. Easy throughout." },
      { session_in_week: 2, type: "easy", target_duration_min: 34, target_description: "15 min run / 1 min walk × 2. Long, easy run blocks." },
      { session_in_week: 3, type: "long", target_duration_min: 35, target_description: "MILESTONE: 30-35 min continuous easy run — walk only if you truly need to. You're now a runner. Stay slow." },
    ],
  },

  // ── DELOAD WEEK 4 ────────────────────────────────────────────────
  {
    week: 4,
    sessions: [
      { session_in_week: 1, type: "easy", target_duration_min: 20, target_description: "DELOAD: 20 min easy continuous (walk breaks fine). The body absorbs adaptation from weeks 1-3 now — don't skip this." },
      { session_in_week: 2, type: "easy", target_duration_min: 22, target_description: "DELOAD: 22 min easy. Gentle and relaxed." },
      { session_in_week: 3, type: "easy", target_duration_min: 24, target_description: "DELOAD: 24 min easy continuous. Recovery is where the fitness is built." },
    ],
  },

  // ── PHASE 2: Continuous Zone 2 build (Weeks 5-7) ─────────────────
  // Standard session climbs toward 40 min. The weekly long run and the optional
  // unstructured session both appear now that you're adapted to continuous running.
  {
    week: 5,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 32, target_description: "Zone 2: 32 min continuous easy. Conversational — nose-breathing if you can." },
      { session_in_week: 2, type: "easy",         target_duration_min: 35, target_description: "Zone 2: 35 min continuous easy." },
      { session_in_week: 3, type: "long",         target_duration_min: 45, target_description: "Long Zone 2: 45 min easy. Your first long run — keep it genuinely easy the whole way. Time on feet is the point." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 45, target_description: "OPTIONAL: 45-60 min easy walk or very easy jog. No structure, no targets, no progression. Just enjoyable aerobic time. Skip freely if you're tired.", optional: true },
    ],
  },
  {
    week: 6,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 35, target_description: "Zone 2: 35 min easy continuous." },
      { session_in_week: 2, type: "easy",         target_duration_min: 38, target_description: "Zone 2: 38 min easy." },
      { session_in_week: 3, type: "long",         target_duration_min: 50, target_description: "Long Zone 2: 50 min easy. Settle into a rhythm you could hold for hours." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 50, target_description: "OPTIONAL: 45-60 min easy walk/jog, fully unstructured. Recovery and base — only if you feel good.", optional: true },
    ],
  },
  {
    week: 7,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 38, target_description: "Zone 2: 38 min easy." },
      { session_in_week: 2, type: "easy",         target_duration_min: 40, target_description: "Zone 2: 40 min easy. This is your standard session length from here on." },
      { session_in_week: 3, type: "long",         target_duration_min: 55, target_description: "Long Zone 2: 55 min easy." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 55, target_description: "OPTIONAL: 45-75 min easy walk/jog, fully unstructured.", optional: true },
    ],
  },

  // ── EASIER WEEK 8 (down week before intensity is introduced) ─────
  {
    week: 8,
    sessions: [
      { session_in_week: 1, type: "easy", target_duration_min: 30, target_description: "EASIER WEEK: 30 min easy. Pull volume back before VO2 work is introduced next block." },
      { session_in_week: 2, type: "easy", target_duration_min: 32, target_description: "EASIER WEEK: 32 min easy." },
      { session_in_week: 3, type: "long", target_duration_min: 40, target_description: "EASIER WEEK long: 40 min easy (reduced). Arrive at the VO2 block fresh, not flat." },
    ],
  },

  // ── PHASE 3: Zone 2 + VO2 max introduced, wave-loaded (Weeks 9-11)
  // VO2 starts conservative and is NOT pushed up every week — week 11 deliberately
  // pulls intensity back. Structure: 5 min warm-up → intervals → 3 min cool-down.
  {
    week: 9,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 35, target_description: "Zone 2: 35 min easy." },
      { session_in_week: 2, type: "interval",     target_duration_min: 30, target_description: "VO2 INTRO: 5 min warm-up → 4 × (2 min hard / 2 min easy) → 3 min cool-down. Hard ≈ 90% HR, controlled, NOT a sprint. First taste of intensity — keep it submaximal." },
      { session_in_week: 3, type: "long",         target_duration_min: 50, target_description: "Long Zone 2: 50 min easy. Keep it aerobic — don't let the interval session bleed in." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 50, target_description: "OPTIONAL: 45-75 min easy unstructured walk/jog.", optional: true },
    ],
  },
  {
    week: 10,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 40, target_description: "Zone 2: 40 min easy." },
      { session_in_week: 2, type: "interval",     target_duration_min: 34, target_description: "VO2: 5 min warm-up → 4 × (3 min hard / 3 min easy) → 3 min cool-down. Longer work intervals. Uncomfortable but controlled — never a sprint." },
      { session_in_week: 3, type: "long",         target_duration_min: 55, target_description: "Long Zone 2: 55 min easy." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 55, target_description: "OPTIONAL: 45-75 min easy unstructured.", optional: true },
    ],
  },
  {
    week: 11,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 40, target_description: "Zone 2: 40 min easy." },
      { session_in_week: 2, type: "interval",     target_duration_min: 26, target_description: "REDUCED VO2: 5 min warm-up → 3 × (3 min hard / 3 min easy) → 3 min cool-down. Deliberately lighter intensity week — maintain the stimulus while shedding fatigue. This waving is the point." },
      { session_in_week: 3, type: "long",         target_duration_min: 60, target_description: "Long Zone 2: 60 min easy. The long run is the priority this week — enjoy it." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 60, target_description: "OPTIONAL: 45-75 min easy unstructured.", optional: true },
    ],
  },

  // ── DELOAD WEEK 12 ───────────────────────────────────────────────
  {
    week: 12,
    sessions: [
      { session_in_week: 1, type: "easy", target_duration_min: 28, target_description: "DELOAD: 28 min easy." },
      { session_in_week: 2, type: "easy", target_duration_min: 30, target_description: "DELOAD: 30 min easy — no intervals this week. Full recovery from the first VO2 block." },
      { session_in_week: 3, type: "long", target_duration_min: 40, target_description: "DELOAD long: 40 min easy (reduced). Back stronger next week." },
    ],
  },

  // ── PHASE 4: Full sustainable pattern (Weeks 13-15) ──────────────
  // The Norwegian 4×4 appears, but VO2 is varied and waved — short intervals one
  // week, reduced load the next — so it never becomes a weekly grind. This IS the
  // long-term shape of the training.
  {
    week: 13,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 40, target_description: "Zone 2: 40 min easy. Fresh post-deload — you'll feel strong." },
      { session_in_week: 2, type: "interval",     target_duration_min: 41, target_description: "VO2 — NORWEGIAN 4×4: 5 min warm-up → 4 × (4 min hard / 4 min easy) → 3 min cool-down. The benchmark VO2 session. Hold 90-95% HR for each 4-min block — controlled, not all-out." },
      { session_in_week: 3, type: "long",         target_duration_min: 55, target_description: "Long Zone 2: 55 min easy." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 60, target_description: "OPTIONAL: 45-75 min easy unstructured.", optional: true },
    ],
  },
  {
    week: 14,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 40, target_description: "Zone 2: 40 min easy." },
      { session_in_week: 2, type: "interval",     target_duration_min: 33, target_description: "VO2 VARIETY: 5 min warm-up → 6 × (1.5 min hard / 1.5 min easy) → 3 min cool-down. Shorter, sharper intervals — same system, different stimulus. Variety keeps VO2 work sustainable, not just harder." },
      { session_in_week: 3, type: "long",         target_duration_min: 60, target_description: "Long Zone 2: 60 min easy." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 65, target_description: "OPTIONAL: 45-75 min easy unstructured.", optional: true },
    ],
  },
  {
    week: 15,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 40, target_description: "Zone 2: 40 min easy." },
      { session_in_week: 2, type: "interval",     target_duration_min: 26, target_description: "REDUCED VO2: 5 min warm-up → 3 × (3 min hard / 3 min easy) → 3 min cool-down. Lighter again. This 3-4 week waving of intensity is exactly what lets you keep doing VO2 work for years." },
      { session_in_week: 3, type: "long",         target_duration_min: 65, target_description: "Long Zone 2: 65 min easy. Peak long run of the program — relaxed and steady." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 70, target_description: "OPTIONAL: 45-75 min easy unstructured.", optional: true },
    ],
  },

  // ── WEEK 16: Transition to the lifelong pattern ──────────────────
  {
    week: 16,
    sessions: [
      { session_in_week: 1, type: "easy",         target_duration_min: 35, target_description: "Zone 2: 35 min easy." },
      { session_in_week: 2, type: "interval",     target_duration_min: 41, target_description: "VO2 — NORWEGIAN 4×4: 5 min warm-up → 4 × (4 min hard / 4 min easy) → 3 min cool-down. From here this is a REPEATING sustainable session — not something to keep increasing." },
      { session_in_week: 3, type: "long",         target_duration_min: 55, target_description: "Long Zone 2: 50-60 min easy." },
      { session_in_week: 4, type: "unstructured", target_duration_min: 60, target_description: "OPTIONAL: 45-75 min easy unstructured. THE ONGOING PATTERN to hold for years: 1 standard Zone 2, 1 VO2 session (waved easier every 3-4 weeks), 1 long Zone 2, 1 optional easy. You have a real aerobic base and a higher VO2 max — now just keep it.", optional: true },
    ],
  },
];
