CREATE OR REPLACE FUNCTION generate_batch_round_schedule(p_batch_id UUID)
RETURNS VOID AS $$
DECLARE
    v_count INTEGER;
    v_participant_ids UUID[] := '{}';
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

    -- 6 participants: R1:(1,6),(2,5),(3,4)  R2:(2,6),(1,3),(4,5)  R3:(3,6),(2,4),(1,5)
    IF v_count = 6 THEN
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
            (p_batch_id,1,LEAST(v_participant_ids[1],v_participant_ids[6]),GREATEST(v_participant_ids[1],v_participant_ids[6])),
            (p_batch_id,1,LEAST(v_participant_ids[2],v_participant_ids[5]),GREATEST(v_participant_ids[2],v_participant_ids[5])),
            (p_batch_id,1,LEAST(v_participant_ids[3],v_participant_ids[4]),GREATEST(v_participant_ids[3],v_participant_ids[4]));
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
            (p_batch_id,2,LEAST(v_participant_ids[2],v_participant_ids[6]),GREATEST(v_participant_ids[2],v_participant_ids[6])),
            (p_batch_id,2,LEAST(v_participant_ids[1],v_participant_ids[3]),GREATEST(v_participant_ids[1],v_participant_ids[3])),
            (p_batch_id,2,LEAST(v_participant_ids[4],v_participant_ids[5]),GREATEST(v_participant_ids[4],v_participant_ids[5]));
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
            (p_batch_id,3,LEAST(v_participant_ids[3],v_participant_ids[6]),GREATEST(v_participant_ids[3],v_participant_ids[6])),
            (p_batch_id,3,LEAST(v_participant_ids[2],v_participant_ids[4]),GREATEST(v_participant_ids[2],v_participant_ids[4])),
            (p_batch_id,3,LEAST(v_participant_ids[1],v_participant_ids[5]),GREATEST(v_participant_ids[1],v_participant_ids[5]));
        RETURN;
    END IF;

    -- 12 participants (circle method, fix [12], rotate [1..11])
    -- R1:(1,12),(2,11),(3,10),(4,9),(5,8),(6,7)
    -- R2:(11,12),(1,10),(2,9),(3,8),(4,7),(5,6)
    -- R3:(10,12),(9,11),(1,8),(2,7),(3,6),(4,5)
    IF v_count = 12 THEN
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
            (p_batch_id,1,LEAST(v_participant_ids[1], v_participant_ids[12]),GREATEST(v_participant_ids[1], v_participant_ids[12])),
            (p_batch_id,1,LEAST(v_participant_ids[2], v_participant_ids[11]),GREATEST(v_participant_ids[2], v_participant_ids[11])),
            (p_batch_id,1,LEAST(v_participant_ids[3], v_participant_ids[10]),GREATEST(v_participant_ids[3], v_participant_ids[10])),
            (p_batch_id,1,LEAST(v_participant_ids[4], v_participant_ids[9]), GREATEST(v_participant_ids[4], v_participant_ids[9])),
            (p_batch_id,1,LEAST(v_participant_ids[5], v_participant_ids[8]), GREATEST(v_participant_ids[5], v_participant_ids[8])),
            (p_batch_id,1,LEAST(v_participant_ids[6], v_participant_ids[7]), GREATEST(v_participant_ids[6], v_participant_ids[7]));
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
            (p_batch_id,2,LEAST(v_participant_ids[11],v_participant_ids[12]),GREATEST(v_participant_ids[11],v_participant_ids[12])),
            (p_batch_id,2,LEAST(v_participant_ids[1], v_participant_ids[10]),GREATEST(v_participant_ids[1], v_participant_ids[10])),
            (p_batch_id,2,LEAST(v_participant_ids[2], v_participant_ids[9]), GREATEST(v_participant_ids[2], v_participant_ids[9])),
            (p_batch_id,2,LEAST(v_participant_ids[3], v_participant_ids[8]), GREATEST(v_participant_ids[3], v_participant_ids[8])),
            (p_batch_id,2,LEAST(v_participant_ids[4], v_participant_ids[7]), GREATEST(v_participant_ids[4], v_participant_ids[7])),
            (p_batch_id,2,LEAST(v_participant_ids[5], v_participant_ids[6]), GREATEST(v_participant_ids[5], v_participant_ids[6]));
        INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
            (p_batch_id,3,LEAST(v_participant_ids[10],v_participant_ids[12]),GREATEST(v_participant_ids[10],v_participant_ids[12])),
            (p_batch_id,3,LEAST(v_participant_ids[9], v_participant_ids[11]),GREATEST(v_participant_ids[9], v_participant_ids[11])),
            (p_batch_id,3,LEAST(v_participant_ids[1], v_participant_ids[8]), GREATEST(v_participant_ids[1], v_participant_ids[8])),
            (p_batch_id,3,LEAST(v_participant_ids[2], v_participant_ids[7]), GREATEST(v_participant_ids[2], v_participant_ids[7])),
            (p_batch_id,3,LEAST(v_participant_ids[3], v_participant_ids[6]), GREATEST(v_participant_ids[3], v_participant_ids[6])),
            (p_batch_id,3,LEAST(v_participant_ids[4], v_participant_ids[5]), GREATEST(v_participant_ids[4], v_participant_ids[5]));
        RETURN;
    END IF;

    -- 18 participants: 9 pairs per round
    INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
        (p_batch_id,1,LEAST(v_participant_ids[18],v_participant_ids[1]), GREATEST(v_participant_ids[18],v_participant_ids[1])),
        (p_batch_id,1,LEAST(v_participant_ids[2], v_participant_ids[17]),GREATEST(v_participant_ids[2], v_participant_ids[17])),
        (p_batch_id,1,LEAST(v_participant_ids[3], v_participant_ids[16]),GREATEST(v_participant_ids[3], v_participant_ids[16])),
        (p_batch_id,1,LEAST(v_participant_ids[4], v_participant_ids[15]),GREATEST(v_participant_ids[4], v_participant_ids[15])),
        (p_batch_id,1,LEAST(v_participant_ids[5], v_participant_ids[14]),GREATEST(v_participant_ids[5], v_participant_ids[14])),
        (p_batch_id,1,LEAST(v_participant_ids[6], v_participant_ids[13]),GREATEST(v_participant_ids[6], v_participant_ids[13])),
        (p_batch_id,1,LEAST(v_participant_ids[7], v_participant_ids[12]),GREATEST(v_participant_ids[7], v_participant_ids[12])),
        (p_batch_id,1,LEAST(v_participant_ids[8], v_participant_ids[11]),GREATEST(v_participant_ids[8], v_participant_ids[11])),
        (p_batch_id,1,LEAST(v_participant_ids[9], v_participant_ids[10]),GREATEST(v_participant_ids[9], v_participant_ids[10]));
    INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
        (p_batch_id,2,LEAST(v_participant_ids[18],v_participant_ids[2]), GREATEST(v_participant_ids[18],v_participant_ids[2])),
        (p_batch_id,2,LEAST(v_participant_ids[3], v_participant_ids[1]), GREATEST(v_participant_ids[3], v_participant_ids[1])),
        (p_batch_id,2,LEAST(v_participant_ids[4], v_participant_ids[17]),GREATEST(v_participant_ids[4], v_participant_ids[17])),
        (p_batch_id,2,LEAST(v_participant_ids[5], v_participant_ids[16]),GREATEST(v_participant_ids[5], v_participant_ids[16])),
        (p_batch_id,2,LEAST(v_participant_ids[6], v_participant_ids[15]),GREATEST(v_participant_ids[6], v_participant_ids[15])),
        (p_batch_id,2,LEAST(v_participant_ids[7], v_participant_ids[14]),GREATEST(v_participant_ids[7], v_participant_ids[14])),
        (p_batch_id,2,LEAST(v_participant_ids[8], v_participant_ids[13]),GREATEST(v_participant_ids[8], v_participant_ids[13])),
        (p_batch_id,2,LEAST(v_participant_ids[9], v_participant_ids[12]),GREATEST(v_participant_ids[9], v_participant_ids[12])),
        (p_batch_id,2,LEAST(v_participant_ids[10],v_participant_ids[11]),GREATEST(v_participant_ids[10],v_participant_ids[11]));
    INSERT INTO batch_round_assignments (batch_id, round_number, participant_id_1, participant_id_2) VALUES
        (p_batch_id,3,LEAST(v_participant_ids[18],v_participant_ids[3]), GREATEST(v_participant_ids[18],v_participant_ids[3])),
        (p_batch_id,3,LEAST(v_participant_ids[4], v_participant_ids[2]), GREATEST(v_participant_ids[4], v_participant_ids[2])),
        (p_batch_id,3,LEAST(v_participant_ids[5], v_participant_ids[1]), GREATEST(v_participant_ids[5], v_participant_ids[1])),
        (p_batch_id,3,LEAST(v_participant_ids[6], v_participant_ids[17]),GREATEST(v_participant_ids[6], v_participant_ids[17])),
        (p_batch_id,3,LEAST(v_participant_ids[7], v_participant_ids[16]),GREATEST(v_participant_ids[7], v_participant_ids[16])),
        (p_batch_id,3,LEAST(v_participant_ids[8], v_participant_ids[15]),GREATEST(v_participant_ids[8], v_participant_ids[15])),
        (p_batch_id,3,LEAST(v_participant_ids[9], v_participant_ids[14]),GREATEST(v_participant_ids[9], v_participant_ids[14])),
        (p_batch_id,3,LEAST(v_participant_ids[10],v_participant_ids[13]),GREATEST(v_participant_ids[10],v_participant_ids[13])),
        (p_batch_id,3,LEAST(v_participant_ids[11],v_participant_ids[12]),GREATEST(v_participant_ids[11],v_participant_ids[12]));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_batch_round_schedule IS 'Pre-seed round schedule for 6, 12, or 18 participants (circle method); idempotent.';
