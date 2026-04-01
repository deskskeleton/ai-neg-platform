-- Migration 024: Scenario Assignment Fix
--
-- Fixes the Latin square scenario assignment bug.
-- Previously, get_or_create_round_session derived the scenario from the
-- LEAST-UUID participant's condition_order.  This is wrong because paired
-- participants can have different condition_orders for the same round, and
-- the circle-method pairing schedule is structurally incompatible with
-- per-participant ordering.
--
-- Correct design: all sessions in round r share one scenario (batch-level
-- cyclic rotation ensures cross-batch counterbalancing).
-- Scenario is now stored in batch_round_assignments and read directly.
--
-- Safe to run multiple times (idempotent).

-- 1. Add scenario column (idempotent)
ALTER TABLE batch_round_assignments
    ADD COLUMN IF NOT EXISTS scenario TEXT NOT NULL DEFAULT 'v1.a';

-- 2. Replace generate_batch_round_schedule with scenario-aware version
CREATE OR REPLACE FUNCTION generate_batch_round_schedule(p_batch_id UUID)
RETURNS VOID AS $$
DECLARE
    v_count INTEGER;
    v_participant_ids UUID[] := '{}';
    v_batch_count INTEGER;
    v_rotation INTEGER;
    v_scenarios TEXT[] := ARRAY['v1.a', 'v1.b', 'v1.c'];
    v_s1 TEXT;
    v_s2 TEXT;
    v_s3 TEXT;
BEGIN
    SELECT count(*)::INTEGER INTO v_count
    FROM batch_participants WHERE batch_id = p_batch_id;

    IF v_count NOT IN (6, 12, 18) THEN
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM batch_round_assignments WHERE batch_id = p_batch_id LIMIT 1) THEN
        RETURN;
    END IF;

    SELECT array_agg(participant_id ORDER BY joined_at, id)
    INTO v_participant_ids
    FROM batch_participants
    WHERE batch_id = p_batch_id;

    IF array_length(v_participant_ids, 1) IS NULL OR array_length(v_participant_ids, 1) <> v_count THEN
        RETURN;
    END IF;

    -- Determine scenario rotation: count batches created before this one
    SELECT count(*)::INTEGER INTO v_batch_count
    FROM experiment_batches
    WHERE id <> p_batch_id
      AND created_at <= (SELECT created_at FROM experiment_batches WHERE id = p_batch_id);

    v_rotation := v_batch_count % 3;
    v_s1 := v_scenarios[v_rotation + 1];
    v_s2 := v_scenarios[(v_rotation + 1) % 3 + 1];
    v_s3 := v_scenarios[(v_rotation + 2) % 3 + 1];

    -- ========== 6 participants ==========
    IF v_count = 6 THEN
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
        VALUES
            (p_batch_id, 1, LEAST(v_participant_ids[1], v_participant_ids[6]), GREATEST(v_participant_ids[1], v_participant_ids[6]), v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[2], v_participant_ids[5]), GREATEST(v_participant_ids[2], v_participant_ids[5]), v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[3], v_participant_ids[4]), GREATEST(v_participant_ids[3], v_participant_ids[4]), v_s1);
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
        VALUES
            (p_batch_id, 2, LEAST(v_participant_ids[2], v_participant_ids[6]), GREATEST(v_participant_ids[2], v_participant_ids[6]), v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[1], v_participant_ids[3]), GREATEST(v_participant_ids[1], v_participant_ids[3]), v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[4], v_participant_ids[5]), GREATEST(v_participant_ids[4], v_participant_ids[5]), v_s2);
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
        VALUES
            (p_batch_id, 3, LEAST(v_participant_ids[3], v_participant_ids[6]), GREATEST(v_participant_ids[3], v_participant_ids[6]), v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[2], v_participant_ids[4]), GREATEST(v_participant_ids[2], v_participant_ids[4]), v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[1], v_participant_ids[5]), GREATEST(v_participant_ids[1], v_participant_ids[5]), v_s3);
        RETURN;
    END IF;

    -- ========== 12 participants ==========
    IF v_count = 12 THEN
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
        VALUES
            (p_batch_id, 1, LEAST(v_participant_ids[1],  v_participant_ids[12]), GREATEST(v_participant_ids[1],  v_participant_ids[12]), v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[2],  v_participant_ids[11]), GREATEST(v_participant_ids[2],  v_participant_ids[11]), v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[3],  v_participant_ids[10]), GREATEST(v_participant_ids[3],  v_participant_ids[10]), v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[4],  v_participant_ids[9]),  GREATEST(v_participant_ids[4],  v_participant_ids[9]),  v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[5],  v_participant_ids[8]),  GREATEST(v_participant_ids[5],  v_participant_ids[8]),  v_s1),
            (p_batch_id, 1, LEAST(v_participant_ids[6],  v_participant_ids[7]),  GREATEST(v_participant_ids[6],  v_participant_ids[7]),  v_s1);
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
        VALUES
            (p_batch_id, 2, LEAST(v_participant_ids[11], v_participant_ids[12]), GREATEST(v_participant_ids[11], v_participant_ids[12]), v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[1],  v_participant_ids[10]), GREATEST(v_participant_ids[1],  v_participant_ids[10]), v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[2],  v_participant_ids[9]),  GREATEST(v_participant_ids[2],  v_participant_ids[9]),  v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[3],  v_participant_ids[8]),  GREATEST(v_participant_ids[3],  v_participant_ids[8]),  v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[4],  v_participant_ids[7]),  GREATEST(v_participant_ids[4],  v_participant_ids[7]),  v_s2),
            (p_batch_id, 2, LEAST(v_participant_ids[5],  v_participant_ids[6]),  GREATEST(v_participant_ids[5],  v_participant_ids[6]),  v_s2);
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
        VALUES
            (p_batch_id, 3, LEAST(v_participant_ids[10], v_participant_ids[12]), GREATEST(v_participant_ids[10], v_participant_ids[12]), v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[9],  v_participant_ids[11]), GREATEST(v_participant_ids[9],  v_participant_ids[11]), v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[1],  v_participant_ids[8]),  GREATEST(v_participant_ids[1],  v_participant_ids[8]),  v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[2],  v_participant_ids[7]),  GREATEST(v_participant_ids[2],  v_participant_ids[7]),  v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[3],  v_participant_ids[6]),  GREATEST(v_participant_ids[3],  v_participant_ids[6]),  v_s3),
            (p_batch_id, 3, LEAST(v_participant_ids[4],  v_participant_ids[5]),  GREATEST(v_participant_ids[4],  v_participant_ids[5]),  v_s3);
        RETURN;
    END IF;

    -- ========== 18 participants ==========
    INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
    VALUES
        (p_batch_id, 1, LEAST(v_participant_ids[18], v_participant_ids[1]),  GREATEST(v_participant_ids[18], v_participant_ids[1]),  v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[2],  v_participant_ids[17]), GREATEST(v_participant_ids[2],  v_participant_ids[17]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[3],  v_participant_ids[16]), GREATEST(v_participant_ids[3],  v_participant_ids[16]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[4],  v_participant_ids[15]), GREATEST(v_participant_ids[4],  v_participant_ids[15]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[5],  v_participant_ids[14]), GREATEST(v_participant_ids[5],  v_participant_ids[14]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[6],  v_participant_ids[13]), GREATEST(v_participant_ids[6],  v_participant_ids[13]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[7],  v_participant_ids[12]), GREATEST(v_participant_ids[7],  v_participant_ids[12]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[8],  v_participant_ids[11]), GREATEST(v_participant_ids[8],  v_participant_ids[11]), v_s1),
        (p_batch_id, 1, LEAST(v_participant_ids[9],  v_participant_ids[10]), GREATEST(v_participant_ids[9],  v_participant_ids[10]), v_s1);
    INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
    VALUES
        (p_batch_id, 2, LEAST(v_participant_ids[18], v_participant_ids[2]),  GREATEST(v_participant_ids[18], v_participant_ids[2]),  v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[3],  v_participant_ids[1]),  GREATEST(v_participant_ids[3],  v_participant_ids[1]),  v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[4],  v_participant_ids[17]), GREATEST(v_participant_ids[4],  v_participant_ids[17]), v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[5],  v_participant_ids[16]), GREATEST(v_participant_ids[5],  v_participant_ids[16]), v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[6],  v_participant_ids[15]), GREATEST(v_participant_ids[6],  v_participant_ids[15]), v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[7],  v_participant_ids[14]), GREATEST(v_participant_ids[7],  v_participant_ids[14]), v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[8],  v_participant_ids[13]), GREATEST(v_participant_ids[8],  v_participant_ids[13]), v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[9],  v_participant_ids[12]), GREATEST(v_participant_ids[9],  v_participant_ids[12]), v_s2),
        (p_batch_id, 2, LEAST(v_participant_ids[10], v_participant_ids[11]), GREATEST(v_participant_ids[10], v_participant_ids[11]), v_s2);
    INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2, scenario)
    VALUES
        (p_batch_id, 3, LEAST(v_participant_ids[18], v_participant_ids[3]),  GREATEST(v_participant_ids[18], v_participant_ids[3]),  v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[4],  v_participant_ids[2]),  GREATEST(v_participant_ids[4],  v_participant_ids[2]),  v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[5],  v_participant_ids[1]),  GREATEST(v_participant_ids[5],  v_participant_ids[1]),  v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[6],  v_participant_ids[17]), GREATEST(v_participant_ids[6],  v_participant_ids[17]), v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[7],  v_participant_ids[16]), GREATEST(v_participant_ids[7],  v_participant_ids[16]), v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[8],  v_participant_ids[15]), GREATEST(v_participant_ids[8],  v_participant_ids[15]), v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[9],  v_participant_ids[14]), GREATEST(v_participant_ids[9],  v_participant_ids[14]), v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[10], v_participant_ids[13]), GREATEST(v_participant_ids[10], v_participant_ids[13]), v_s3),
        (p_batch_id, 3, LEAST(v_participant_ids[11], v_participant_ids[12]), GREATEST(v_participant_ids[11], v_participant_ids[12]), v_s3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_batch_round_schedule IS 'Pre-seed round schedule for 6, 12, or 18 participants (circle method); assigns scenarios via cyclic batch rotation; idempotent.';

-- 3. Fix get_or_create_round_session: read scenario from batch_round_assignments
CREATE OR REPLACE FUNCTION get_or_create_round_session(
    p_batch_id UUID,
    p_participant_id UUID,
    p_round_number INTEGER
)
RETURNS TABLE(session_id UUID, session_code TEXT, role TEXT, dyad_id UUID) AS $$
DECLARE
    v_partner_id UUID;
    v_condition TEXT;
    v_session_id UUID;
    v_session_code TEXT;
    v_dyad_id UUID;
    v_my_role TEXT;
BEGIN
    IF p_round_number < 1 OR p_round_number > 3 THEN
        RETURN;
    END IF;

    SELECT CASE
        WHEN bra.participant_id_1 = p_participant_id THEN bra.participant_id_2
        ELSE bra.participant_id_1
    END INTO v_partner_id
    FROM batch_round_assignments bra
    WHERE bra.batch_id = p_batch_id AND bra.round_number = p_round_number
      AND (bra.participant_id_1 = p_participant_id OR bra.participant_id_2 = p_participant_id);

    IF v_partner_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO round_queue (participant_id, round_number)
    VALUES (p_participant_id, p_round_number)
    ON CONFLICT (participant_id, round_number) DO NOTHING;

    -- Session already exists for this pair + round?
    SELECT s.id, s.session_code, s.dyad_id INTO v_session_id, v_session_code, v_dyad_id
    FROM sessions s
    JOIN session_participants sp1 ON sp1.session_id = s.id AND sp1.participant_id = p_participant_id
    JOIN session_participants sp2 ON sp2.session_id = s.id AND sp2.participant_id = v_partner_id
    WHERE s.round_number = p_round_number
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
        SELECT sp.role INTO v_my_role FROM session_participants sp WHERE sp.session_id = v_session_id AND sp.participant_id = p_participant_id;
        session_id := v_session_id;
        session_code := v_session_code;
        role := v_my_role;
        dyad_id := v_dyad_id;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Partner in queue?
    IF NOT EXISTS (SELECT 1 FROM round_queue WHERE participant_id = v_partner_id AND round_number = p_round_number) THEN
        RETURN;
    END IF;

    PERFORM 1 FROM round_queue
    WHERE (participant_id = p_participant_id OR participant_id = v_partner_id) AND round_number = p_round_number
    FOR UPDATE;

    -- Re-check (other transaction may have just created it)
    SELECT s.id INTO v_session_id
    FROM sessions s
    JOIN session_participants sp1 ON sp1.session_id = s.id AND sp1.participant_id = p_participant_id
    JOIN session_participants sp2 ON sp2.session_id = s.id AND sp2.participant_id = v_partner_id
    WHERE s.round_number = p_round_number LIMIT 1;
    IF v_session_id IS NOT NULL THEN
        SELECT s.session_code, s.dyad_id INTO v_session_code, v_dyad_id FROM sessions s WHERE s.id = v_session_id;
        SELECT sp.role INTO v_my_role FROM session_participants sp WHERE sp.session_id = v_session_id AND sp.participant_id = p_participant_id;
        session_id := v_session_id;
        session_code := v_session_code;
        role := v_my_role;
        dyad_id := v_dyad_id;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Read scenario from the pre-seeded assignment (not from participant condition_order)
    SELECT bra.scenario INTO v_condition
    FROM batch_round_assignments bra
    WHERE bra.batch_id = p_batch_id AND bra.round_number = p_round_number
      AND (bra.participant_id_1 = p_participant_id OR bra.participant_id_2 = p_participant_id)
    LIMIT 1;

    IF v_condition IS NULL OR v_condition = '' THEN
        v_condition := 'v1.a';
    END IF;

    -- Swap roles on even rounds so participants alternate between pm/developer
    v_session_id := create_one_pool_session(
        LEAST(p_participant_id, v_partner_id)::UUID,
        GREATEST(p_participant_id, v_partner_id)::UUID,
        p_round_number,
        v_condition,
        (p_round_number % 2 = 0)  -- swap roles on round 2
    );

    DELETE FROM round_queue
    WHERE (participant_id = p_participant_id OR participant_id = v_partner_id) AND round_number = p_round_number;

    SELECT s.session_code, s.dyad_id INTO v_session_code, v_dyad_id FROM sessions s WHERE s.id = v_session_id;
    SELECT sp.role INTO v_my_role FROM session_participants sp WHERE sp.session_id = v_session_id AND sp.participant_id = p_participant_id;

    session_id := v_session_id;
    session_code := v_session_code;
    role := v_my_role;
    dyad_id := v_dyad_id;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_round_session IS 'Pre-seeded flow: look up partner and scenario from batch_round_assignments; create session when both in queue.';
