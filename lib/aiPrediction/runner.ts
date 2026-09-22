import supabaseAdmin from "@/lib/supabaseAdmin";
import type {
  GeminiPrediction,
  PredictionProcessInput,
  PredictionSettingsRow,
  SavedPrediction,
} from "./types";

const MODEL = "gemini-3.8-flash";
const FALLBACK_COMMENT =
  "実績不足のため、工程能力設定の日産数量で計算しています。";
const MULTIPLE_CAPACITY_COMMENT =
  "工程能力設定に同じ工程の有効な設定が複数登録されているため、予測できません。使用する設定を1件に整理してください。";

type DbRow = Record<string, unknown>;

const numberValue = (value: unknown) => Number(value || 0);
const textValue = (value: unknown) => (value == null ? "" : String(value));

const dateKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);

const addDays = (
  start: string,
  days: number,
  holidaySet: Set<string>,
  useCalendarDays: boolean,
) => {
  const date = parseDate(start);
  let remaining = Math.max(1, Math.ceil(days));
  while (remaining > 0) {
    if (
      useCalendarDays ||
      (!holidaySet.has(dateKey(date)) && date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
    ) {
      remaining -= 1;
    }
    if (remaining > 0) date.setUTCDate(date.getUTCDate() + 1);
  }
  return dateKey(date);
};

const nextDay = (date: string, holidaySet: Set<string>, useCalendarDays: boolean) => {
  const next = parseDate(date);
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (
    !useCalendarDays &&
    (holidaySet.has(dateKey(next)) || next.getUTCDay() === 0 || next.getUTCDay() === 6)
  );
  return dateKey(next);
};

const getTodayInJapan = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const fetchGeminiPredictions = async (inputs: PredictionProcessInput[]) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  if (inputs.length === 0) return new Map<string, GeminiPrediction>();

  const payload = inputs.map((item) => ({
    orderProcessId: item.orderProcessId,
    processName: item.processName,
    remainingAmount: item.remainingAmount,
    historySampleCount: item.historySampleCount,
    historyBusinessDays: item.historyBusinessDays,
    historicalDailyAmount: item.historicalDailyAmount,
    historicalDurationDays: item.historicalDurationDays,
    outsourcing: item.outsourcing,
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You estimate Japanese factory process durations.",
                  "Return only the requested JSON. Use the supplied aggregated history; never invent IDs.",
                  "durationDays must be an integer of at least 1. Keep reason concise in Japanese.",
                  JSON.stringify(payload),
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            required: ["predictions"],
            properties: {
              predictions: {
                type: "array",
                items: {
                  type: "object",
                  required: ["orderProcessId", "durationDays", "reason"],
                  properties: {
                    orderProcessId: { type: "string" },
                    durationDays: { type: "integer", minimum: 1 },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Gemini API ${response.status}: ${body.slice(0, 500)}`);
    Object.assign(error, { status: response.status });
    throw error;
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonText = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) throw new Error("Gemini returned an empty response");
  const parsed = JSON.parse(jsonText) as { predictions?: GeminiPrediction[] };
  const validIds = new Set(inputs.map((item) => item.orderProcessId));
  return new Map(
    (parsed.predictions || [])
      .filter(
        (item) =>
          validIds.has(item.orderProcessId) &&
          Number.isFinite(item.durationDays) &&
          item.durationDays >= 1,
      )
      .map((item) => [item.orderProcessId, item]),
  );
};

export async function runAiPrediction(triggerType: "manual" | "scheduled") {
  if (!supabaseAdmin) throw new Error("Supabase admin configuration is missing");

  const { data: settingsData, error: settingsError } = await supabaseAdmin
    .from("ai_prediction_settings")
    .select("*")
    .eq("id", "global")
    .single();
  if (settingsError) throw settingsError;

  const settings = settingsData as PredictionSettingsRow;
  if (triggerType === "manual" && !settings.validation_mode) {
    return { skipped: true, message: "本番運用設定では手動更新を使用できません。" };
  }
  const { data: runData, error: runError } = await supabaseAdmin
    .from("ai_prediction_runs")
    .insert({
      trigger_type: triggerType,
      status: "running",
      model: MODEL,
      settings_snapshot: settings,
    })
    .select("id")
    .single();
  if (runError) {
    if (runError.code === "23505") {
      return { skipped: true, message: "AI予測はすでに実行中です。" };
    }
    throw runError;
  }

  const runId = String(runData.id);
  try {
    if (!settings.enabled) {
      await supabaseAdmin
        .from("ai_prediction_runs")
        .update({ status: "skipped", finished_at: new Date().toISOString() })
        .eq("id", runId);
      return { runId, skipped: true, message: "AI予測がOFFのため実行しませんでした。" };
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - settings.max_reference_days);
    const cutoffDate = dateKey(cutoff);

    const [postsResponse, processesResponse, resultsResponse, linesResponse, mastersResponse, calendarResponse] =
      await Promise.all([
        supabaseAdmin
          .from("posts")
          .select("id,order_no,product_id,product_name,order_amount,delivery_date,delete")
          .eq("delete", false),
        supabaseAdmin.from("order_processes").select("*"),
        supabaseAdmin
          .from("production_results")
          .select("id,post_id,order_process_id,process_name,date,amount")
          .gte("date", cutoffDate),
        supabaseAdmin.from("line_master").select("*").eq("enabled", true),
        supabaseAdmin.from("process_master").select("id,process_id,name,outsourcing"),
        supabaseAdmin.from("company_calendar").select("date,is_holiday").eq("is_holiday", true),
      ]);

    const firstError = [postsResponse, processesResponse, resultsResponse, linesResponse, mastersResponse, calendarResponse]
      .map((response) => response.error)
      .find(Boolean);
    if (firstError) throw firstError;

    const posts = (postsResponse.data || []) as DbRow[];
    const allProcesses = (processesResponse.data || []) as DbRow[];
    const allResults = (resultsResponse.data || []) as DbRow[];
    const lines = (linesResponse.data || []) as DbRow[];
    const processMasters = (mastersResponse.data || []) as DbRow[];
    const holidaySet = new Set(
      ((calendarResponse.data || []) as DbRow[]).map((row) => textValue(row.date).slice(0, 10)),
    );
    const postMap = new Map(posts.map((post) => [textValue(post.id), post]));
    const resultsByProcess = new Map<string, DbRow[]>();
    allResults.forEach((result) => {
      const processId = textValue(result.order_process_id);
      const list = resultsByProcess.get(processId) || [];
      list.push(result);
      resultsByProcess.set(processId, list);
    });

    const targetProcesses = allProcesses
      .filter((process) => postMap.has(textValue(process.post_id)))
      .sort((a, b) => numberValue(a.process_order) - numberValue(b.process_order));
    const activePostIds = new Set<string>();
    const inputs: PredictionProcessInput[] = [];

    for (const process of targetProcesses) {
      const post = postMap.get(textValue(process.post_id));
      if (!post) continue;
      const plannedAmount = Math.max(numberValue(process.planned_amount), numberValue(post.order_amount));
      const completedAmount = numberValue(process.completed_amount);
      const remainingAmount = Math.max(0, plannedAmount - completedAmount);
      const processName = textValue(process.process_name);
      const isManufacturing = processName.includes("製造");
      const productName = textValue(process.product_name) || textValue(post.product_name);

      if (remainingAmount > 0) activePostIds.add(textValue(post.id));

      const matchingHistoricalProcesses = allProcesses.filter(
        (candidate) =>
          textValue(candidate.product_name) === productName &&
          textValue(candidate.process_name) === processName,
      );
      const matchingResults = matchingHistoricalProcesses.flatMap(
        (candidate) => resultsByProcess.get(textValue(candidate.id)) || [],
      );
      const dailyTotals = new Map<string, number>();
      matchingResults.forEach((result) => {
        const day = textValue(result.date).slice(0, 10);
        dailyTotals.set(day, (dailyTotals.get(day) || 0) + numberValue(result.amount));
      });
      const historyBusinessDays = dailyTotals.size;
      const historySampleCount = matchingHistoricalProcesses.filter(
        (candidate) => Boolean(candidate.completed_date),
      ).length;
      const totalHistoricalAmount = [...dailyTotals.values()].reduce((sum, amount) => sum + amount, 0);
      const historicalDailyAmount = historyBusinessDays
        ? totalHistoricalAmount / historyBusinessDays
        : null;
      const durationSamples = matchingHistoricalProcesses
        .map((candidate) => {
          const created = textValue(candidate.created_at).slice(0, 10);
          const completed = textValue(candidate.completed_date).slice(0, 10);
          if (!created || !completed) return null;
          return Math.max(1, Math.ceil((parseDate(completed).getTime() - parseDate(created).getTime()) / 86_400_000));
        })
        .filter((value): value is number => value != null);
      const historicalDurationDays = durationSamples.length
        ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
        : null;
      const historySufficient = isManufacturing
        ? historyBusinessDays >= settings.manufacturing_min_business_days
        : historySampleCount >= settings.other_process_min_lots;

      const processMaster = processMasters.find(
        (master) => textValue(master.name) === processName,
      );
      const capacityRows = lines.filter(
        (line) =>
          textValue(line.process_id) === textValue(processMaster?.process_id) ||
          textValue(line.process_id) === textValue(processMaster?.id),
      );
      const comments: string[] = [];
      let sourceType: PredictionProcessInput["sourceType"] = "gemini";
      let capacityDailyAmount: number | null = null;
      let capacityOperationRate: number | null = null;

      if (remainingAmount <= 0 && process.completed_date) {
        sourceType = "actual";
      } else if (!settings.use_past_results || !historySufficient) {
        sourceType = "capacity";
        comments.push(FALLBACK_COMMENT);
        if (capacityRows.length > 1) {
          sourceType = "unavailable";
          comments.push(MULTIPLE_CAPACITY_COMMENT);
        } else if (capacityRows.length === 1) {
          capacityDailyAmount = numberValue(capacityRows[0].daily_capacity);
          capacityOperationRate = numberValue(capacityRows[0].operation_rate);
          if (capacityOperationRate <= 0) {
            sourceType = "unavailable";
            comments.push("稼働率が0％のため予測できません。");
          }
        } else {
          sourceType = "unavailable";
          comments.push("工程能力設定が未登録のため、予測できません。");
        }
      }

      if (isManufacturing && !textValue(process.press_number)) {
        comments.push("プレス機No未設定のため、設備の競合を考慮していません。");
      }

      inputs.push({
        postId: textValue(post.id),
        orderProcessId: textValue(process.id),
        orderNo: textValue(post.order_no),
        productName,
        deliveryDate: textValue(post.delivery_date).slice(0, 10),
        processName,
        processOrder: numberValue(process.process_order),
        plannedAmount,
        completedAmount,
        remainingAmount,
        completedDate: textValue(process.completed_date).slice(0, 10) || null,
        outsourcing: Boolean(process.subcontractor_id || processMaster?.outsourcing),
        subcontractorName: textValue(process.subcontractor_name) || null,
        outsourceSentDate: textValue(process.outsource_sent_date).slice(0, 10) || null,
        outsourceReturnedDate: textValue(process.outsource_returned_date).slice(0, 10) || null,
        historySampleCount,
        historyBusinessDays,
        historicalDailyAmount,
        historicalDurationDays,
        capacityDailyAmount,
        capacityOperationRate,
        sourceType,
        comments,
      });
    }

    const activeInputs = inputs.filter((input) => activePostIds.has(input.postId));
    await supabaseAdmin
      .from("ai_prediction_runs")
      .update({ target_count: activePostIds.size })
      .eq("id", runId);

    if (activeInputs.length > 0) {
      const { error: snapshotError } = await supabaseAdmin
        .from("ai_prediction_input_snapshots")
        .insert(
          activeInputs.map((input) => ({
            run_id: runId,
            post_id: input.postId,
            order_process_id: input.orderProcessId,
            aggregate_data: input,
          })),
        );
      if (snapshotError) throw snapshotError;
    }

    const geminiInputs = activeInputs.filter((input) => input.sourceType === "gemini");
    const geminiMap = await fetchGeminiPredictions(geminiInputs);
    const grouped = new Map<string, PredictionProcessInput[]>();
    activeInputs.forEach((input) => {
      const list = grouped.get(input.postId) || [];
      list.push(input);
      grouped.set(input.postId, list);
    });

    const saved: SavedPrediction[] = [];
    const today = getTodayInJapan();
    let failedPosts = 0;
    for (const processInputs of grouped.values()) {
      processInputs.sort((a, b) => a.processOrder - b.processOrder);
      let cursor = today;
      let postUnavailable = false;
      for (const input of processInputs) {
        let startDate = cursor;
        let endDate: string | null = null;
        let status: SavedPrediction["status"] = "predicted";
        let reason = "";
        const comments = [...input.comments];

        if (input.sourceType === "actual" && input.completedDate) {
          startDate = input.completedDate;
          endDate = input.completedDate;
          status = "confirmed";
          reason = "完了実績日を使用しています。";
        } else if (input.sourceType === "unavailable" || postUnavailable) {
          status = "unavailable";
          startDate = cursor;
          reason = postUnavailable ? "前工程が予測不能のため予測できません。" : comments.at(-1) || "予測できません。";
          postUnavailable = true;
        } else {
          let durationDays = 1;
          if (input.sourceType === "gemini") {
            const gemini = geminiMap.get(input.orderProcessId);
            if (!gemini) {
              status = "unavailable";
              reason = "Geminiの回答に対象工程が含まれていません。";
              comments.push("予測の更新に失敗しました。翌朝の定期更新で再実行します。");
              postUnavailable = true;
            } else {
              durationDays = gemini.durationDays;
              reason = gemini.reason;
              comments.push("Geminiによる実績予測");
            }
          } else {
            const effectiveCapacity =
              (input.capacityDailyAmount || 0) * ((input.capacityOperationRate || 0) / 100);
            if (effectiveCapacity <= 0) {
              status = "unavailable";
              reason = comments.at(-1) || "工程能力を計算できません。";
              postUnavailable = true;
            } else {
              durationDays = Math.max(1, Math.ceil(input.remainingAmount / effectiveCapacity));
              reason = `工程能力 ${Math.round(effectiveCapacity)}個/日で計算しました。`;
              comments.push("工程能力設定による計算");
            }
          }
          if (status !== "unavailable") {
            endDate = addDays(startDate, durationDays, holidaySet, input.outsourcing);
          }
        }

        saved.push({
          post_id: input.postId,
          order_process_id: input.orderProcessId,
          order_no: input.orderNo,
          process_name: input.processName,
          process_order: input.processOrder,
          predicted_start_date: status === "unavailable" ? null : startDate,
          predicted_end_date: endDate,
          source_type: status === "unavailable" ? "unavailable" : input.sourceType,
          status,
          reason,
          comments,
          input_summary: input,
        });
        if (endDate) cursor = nextDay(endDate, holidaySet, input.outsourcing);
      }
      if (postUnavailable) failedPosts += 1;
    }

    if (saved.length > 0) {
      const historyRows = saved.map((item) => ({ ...item, run_id: runId }));
      const { error: historyError } = await supabaseAdmin
        .from("ai_prediction_results")
        .insert(historyRows);
      if (historyError) throw historyError;

      const latestRows = saved
        .filter((item) => item.status !== "unavailable")
        .map((item) => ({
          ...item,
          run_id: runId,
          last_success_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      if (latestRows.length > 0) {
        const { error: latestError } = await supabaseAdmin
          .from("ai_prediction_latest")
          .upsert(latestRows, { onConflict: "post_id,order_process_id" });
        if (latestError) throw latestError;
      }
    }

    const cutoffHistory = new Date();
    cutoffHistory.setUTCDate(cutoffHistory.getUTCDate() - 90);
    await Promise.all([
      supabaseAdmin.from("ai_prediction_results").delete().lt("created_at", cutoffHistory.toISOString()),
      supabaseAdmin.from("ai_prediction_input_snapshots").delete().lt("created_at", cutoffHistory.toISOString()),
    ]);

    const successCount = Math.max(0, activePostIds.size - failedPosts);
    const finalStatus = failedPosts === 0 ? "succeeded" : successCount > 0 ? "partial" : "failed";
    await supabaseAdmin
      .from("ai_prediction_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        success_count: successCount,
        failed_count: failedPosts,
      })
      .eq("id", runId);

    return { runId, status: finalStatus, targetCount: activePostIds.size, successCount, failedCount: failedPosts };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown prediction error";
    const status = Number((error as { status?: number })?.status || 0);
    const isRateLimit = status === 429;
    const isUnavailable = status === 503;
    await supabaseAdmin
      .from("ai_prediction_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_code: isRateLimit ? "rate_limit" : isUnavailable ? "provider_unavailable" : "execution_error",
        error_message: isRateLimit
          ? "API利用上限に達したため、今回の予測は更新できませんでした。翌朝の定期更新で再実行します。"
          : isUnavailable
            ? "Geminiが一時的に混雑しているため、今回の予測は更新できませんでした。翌朝の定期更新で再実行します。"
          : `${message} 予測の更新に失敗しました。翌朝の定期更新で再実行します。`,
      })
      .eq("id", runId);
    throw error;
  }
}
