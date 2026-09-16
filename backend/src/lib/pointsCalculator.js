// Punkte-Berechnung für Events
// Basiert auf komplexem Multiplikator-System mit Boni

// Punkte für verschiedene Aktivitäten
export const ACTIVITY_POINTS = {
  trip_completed: 50,
  ai_chat_interaction: 10,
  bait_mixer_use: 25,
  ai_analyze: 15,
  fishing_recommendation: 20,
  weather_check: 5,
  spot_analysis: 15,
  water_quality_check: 10,
  gear_logged: 15,
  fish_identified: 20,
  catch_logged: 30,
  photo_shared: 10,
  session_completed: 25,
};

// Reward-System für Platzierungen
export const PLACEMENT_REWARDS = {
  1: {
    points: 5000,
    reward_type: 'premium_plan',
    duration_days: 30,
    plan_type: 'pro',
    description: '1 Monat Pro Plan'
  },
  2: {
    points: 2500,
    reward_type: 'premium_plan',
    duration_days: 14,
    plan_type: 'pro',
    description: '2 Wochen Pro Plan'
  },
  3: {
    points: 1000,
    reward_type: 'premium_plan',
    duration_days: 7,
    plan_type: 'pro',
    description: '1 Woche Pro Plan'
  },
  4: {
    points: 500,
    reward_type: 'ai_tool_choice',
    duration_days: 30,
    tool_type: 'choice', // Benutzer wählt KI-Tool
    description: 'KI-Tool deiner Wahl für 1 Monat'
  }
};

export async function recalcParticipantTotals(eventId, userId, supabase) {
  // total_points wird aus der Summe aller Einreichungen abgeleitet (Source of
  // Truth). Das ist idempotent und vermeidet Lost-Updates bei parallelen
  // Einreichungen/Aktivitaeten (im Gegensatz zu Read-Modify-Write auf
  // total_points).
  const { data: subs } = await supabase
    .from('event_submissions')
    .select('calculated_points')
    .eq('event_id', eventId)
    .eq('user_id', userId);

  const total = (subs || []).reduce(
    (sum, s) => sum + (parseFloat(s.calculated_points) || 0),
    0
  );
  const totals = {
    total_points: Math.round(total * 100) / 100,
    submission_count: subs ? subs.length : 0
  };

  const { data: participant } = await supabase
    .from('event_participants')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single();

  if (participant) {
    await supabase
      .from('event_participants')
      .update(totals)
      .eq('event_id', eventId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('event_participants')
      .insert({
        event_id: eventId,
        user_id: userId,
        joined_at: new Date().toISOString(),
        ...totals
      });
  }

  return totals;
}

export async function addActivityPoints(userId, eventId, activityType, supabase) {
  const points = ACTIVITY_POINTS[activityType] || 0;
  if (points === 0) return { ok: false, message: 'Unknown activity type' };

  try {
    const { error: submissionError } = await supabase
      .from('event_submissions')
      .insert({
        event_id: eventId,
        user_id: userId,
        species: `[${activityType}]`,
        calculated_points: points,
        points_breakdown: { activity: activityType, base: points },
        verified: true,
        submitted_at: new Date().toISOString()
      });

    if (submissionError) throw submissionError;

    await recalcParticipantTotals(eventId, userId, supabase);

    return { ok: true, points, activity: activityType };
  } catch (error) {
    console.error('Error adding activity points:', error);
    return { ok: false, error: error.message };
  }
}

export async function calculateSubmissionPoints(submission, eventId, supabase) {
  try {
    const { data: config, error: configError } = await supabase
      .from('event_point_configs')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (configError && configError.code !== 'PGRST116') {
      console.error('Fehler beim Laden der Event-Konfiguration:', configError);
      return getDefaultPoints(submission);
    }

    if (!config) {
      return getDefaultPoints(submission);
    }

    const basePoints = config.base_points || 100;
    const lengthCm = parseFloat(submission.length_cm) || 0;
    const lengthBonus = lengthCm > 0 ? lengthCm * (config.length_bonus_per_cm || 5.0) : 0;
    const speciesBonus = config.species_bonus && submission.species
      ? parseFloat(config.species_bonus[submission.species]) || 0
      : 0;
    const communityLikes = parseInt(submission.community_likes) || 0;
    const likePointMultiplier = config.like_point_multiplier || 1.0;
    const likesPoints = communityLikes * likePointMultiplier;

    const totalPoints = basePoints + lengthBonus + speciesBonus + likesPoints;

    return {
      total: Math.round(totalPoints * 100) / 100,
      breakdown: {
        base: basePoints,
        length_bonus: Math.round(lengthBonus * 100) / 100,
        species_bonus: speciesBonus,
        likes_points: Math.round(likesPoints * 100) / 100
      }
    };
  } catch (error) {
    console.error('Fehler in calculateSubmissionPoints:', error);
    return getDefaultPoints(submission);
  }
}

function getDefaultPoints(submission) {
  const basePoints = 100;
  const lengthCm = parseFloat(submission.length_cm) || 0;
  const lengthBonus = lengthCm > 0 ? lengthCm * 5.0 : 0;
  const communityLikes = parseInt(submission.community_likes) || 0;
  const likesPoints = communityLikes * 1.0;

  const totalPoints = basePoints + lengthBonus + likesPoints;

  return {
    total: Math.round(totalPoints * 100) / 100,
    breakdown: {
      base: basePoints,
      length_bonus: Math.round(lengthBonus * 100) / 100,
      species_bonus: 0,
      likes_points: Math.round(likesPoints * 100) / 100
    }
  };
}

export function getPlacementBonus(rank, config) {
  if (rank === 1) return config?.first_place_bonus || 500;
  if (rank === 2) return config?.second_place_bonus || 300;
  if (rank === 3) return config?.third_place_bonus || 100;
  return 0;
}

export async function calculateEventFinalRankings(eventId, supabase) {
  try {
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.error('Event nicht gefunden:', eventId);
      return [];
    }

    const { data: config } = await supabase
      .from('event_point_configs')
      .select('*')
      .eq('event_id', eventId)
      .single();

    const { data: submissions, error: submissionsError } = await supabase
      .from('event_submissions')
      .select('user_id, calculated_points')
      .eq('event_id', eventId)
      .order('calculated_points', { ascending: false });

    if (submissionsError) {
      console.error('Fehler beim Laden von Einreichungen:', submissionsError);
      return [];
    }

    const userScores = {};
    submissions.forEach(sub => {
      if (!userScores[sub.user_id]) {
        userScores[sub.user_id] = 0;
      }
      userScores[sub.user_id] += parseFloat(sub.calculated_points) || 0;
    });

    const rankings = Object.entries(userScores)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, totalPoints], index) => {
        const rank = index + 1;
        const placementBonus = getPlacementBonus(rank, config);
        const finalPoints = totalPoints + placementBonus;
        return {
          user_id: userId,
          rank,
          total_points: totalPoints,
          placement_bonus: placementBonus,
          final_points: finalPoints,
          is_winner: rank === 1
        };
      });

    await Promise.all(
      rankings.map(ranking =>
        supabase
          .from('event_participants')
          .update({
            total_points: ranking.final_points,
            is_winner: ranking.is_winner
          })
          .eq('event_id', eventId)
          .eq('user_id', ranking.user_id)
      )
    );

    return rankings;
  } catch (error) {
    console.error('Fehler in calculateEventFinalRankings:', error);
    return [];
  }
}

export async function aggregateMonthlyLeaderboard(year, month, supabase) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const { data: monthlyEvents, error: eventsError } = await supabase
      .from('events')
      .select('id')
      .eq('status', 'ended')
      .gte('end_date', startDate.toISOString())
      .lt('end_date', endDate.toISOString());

    if (eventsError) {
      console.error('Fehler beim Laden von Events:', eventsError);
      return [];
    }

    const eventIds = monthlyEvents.map(e => e.id);
    if (eventIds.length === 0) {
      return [];
    }

    const { data: participants, error: participantsError } = await supabase
      .from('event_participants')
      .select('user_id, total_points')
      .in('event_id', eventIds);

    if (participantsError) {
      console.error('Fehler beim Laden von Teilnehmern:', participantsError);
      return [];
    }

    const userMonthlyPoints = {};
    const userEventCount = {};

    participants.forEach(p => {
      if (!userMonthlyPoints[p.user_id]) {
        userMonthlyPoints[p.user_id] = 0;
        userEventCount[p.user_id] = 0;
      }
      userMonthlyPoints[p.user_id] += parseFloat(p.total_points) || 0;
      userEventCount[p.user_id] += 1;
    });

    // Bestehende Eintraege des Monats laden, um die Aggregation idempotent zu
    // machen: Wird sie erneut ausgefuehrt (z.B. manueller Re-Trigger nach einem
    // Claim), darf ein bereits 'claimed' markierter Gewinner NICHT auf 'pending'
    // zurueckgesetzt werden — sonst wuerde autoActivateRewards die Belohnung ein
    // zweites Mal gewaehren.
    const { data: existingRows } = await supabase
      .from('monthly_leaderboards')
      .select('user_id, reward_status')
      .eq('year', year)
      .eq('month', month);
    const existingStatus = {};
    for (const row of existingRows || []) existingStatus[row.user_id] = row.reward_status;

    const leaderboard = Object.entries(userMonthlyPoints)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, totalPoints], index) => {
        const isWinner = index === 0;
        // Gewinner: bereits eingeloesten Status ('claimed') beibehalten, sonst
        // 'pending'. Nicht-Gewinner immer explizit 'not_eligible' setzen (statt das
        // Feld wegzulassen), damit sowohl der Spalten-Default 'pending' als auch ein
        // veralteter Status aus einem frueheren Lauf (z.B. nach Rang-Wechsel)
        // ueberschrieben wird.
        const reward_status = isWinner
          ? (existingStatus[userId] === 'claimed' ? 'claimed' : 'pending')
          : 'not_eligible';
        return {
          year,
          month,
          user_id: userId,
          total_points: totalPoints,
          event_count: userEventCount[userId],
          rank: index + 1,
          reward_status,
          expires_at: isWinner ? new Date(year + 1, month - 1, 1).toISOString() : null,
        };
      });

    for (const entry of leaderboard) {
      const { error: upsertError } = await supabase
        .from('monthly_leaderboards')
        .upsert({ ...entry }, { onConflict: 'year,month,user_id' });

      if (upsertError) {
        console.error('Fehler beim Speichern des Leaderboards:', upsertError);
      }
    }

    return leaderboard;
  } catch (error) {
    console.error('Fehler in aggregateMonthlyLeaderboard:', error);
    return [];
  }
}

export async function autoActivateRewards(year, month, supabase) {
  try {
    const { data: winners, error: winnersError } = await supabase
      .from('monthly_leaderboards')
      .select('id, user_id')
      .eq('year', year)
      .eq('month', month)
      .eq('rank', 1)
      .eq('reward_status', 'pending');

    if (winnersError) {
      console.error('Fehler beim Laden von Gewinnern:', winnersError);
      return [];
    }

    const activated = [];

    for (const winner of winners) {
      try {
        // Rang-1-Reward laut PLACEMENT_REWARDS (Pro-Plan, 30 Tage) - nicht
        // mehr faelschlich 'basic' hardcoden.
        const reward = PLACEMENT_REWARDS[1];
        const durationDays = reward.duration_days || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        const { data: rewardActivation, error: rewardError } = await supabase
          .from('reward_activations')
          .upsert({
            user_id: winner.user_id,
            leaderboard_id: winner.id,
            plan_id: reward.plan_type || 'pro',
            duration_days: durationDays,
            expires_at: expiresAt.toISOString(),
            status: 'active'
          }, { onConflict: 'user_id' })
          .select()
          .single();

        if (rewardError) {
          console.error('Fehler beim Erstellen der Reward-Aktivierung:', rewardError);
          continue;
        }

        await supabase
          .from('monthly_leaderboards')
          .update({
            reward_status: 'claimed',
            claimed_at: new Date().toISOString()
          })
          .eq('id', winner.id);

        activated.push({
          user_id: winner.user_id,
          expires_at: expiresAt.toISOString()
        });
      } catch (error) {
        console.error(`Fehler bei Reward-Aktivierung für ${winner.user_id}:`, error);
      }
    }

    return activated;
  } catch (error) {
    console.error('Fehler in autoActivateRewards:', error);
    return [];
  }
}
