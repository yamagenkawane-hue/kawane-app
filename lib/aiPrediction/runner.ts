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

const shiftBusinessDays = (date: string, days: number, holidaySet: Set<string>) => {
  const shifted = parseDate(date);
  let remaining = Math.max(0, Math.floor(days));
  const isBusinessDay = () =>
    shifted.getUTCDay() !== 0 &&
    shifted.getUTCDay() !== 6 &&
    !holidaySet.has(dateKey(shifted));

  if (remaining === 0) {
    while (!isBusinessDay()) shifted.setUTCDate(shifted.getUTCDate() + 1);
    return dateKey(shifted);
  }
  while (remaining > 0) {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
    if (isBusinessDay()) remaining -= 1;
  }
  return dateKey(shifted);
};

const countBusinessDays = (start: string, end: string, holidaySet: Set<string>) => {
  if (!start || !end) return null;
  const direction = end >= start ? 1 : -1;
  const cursor = parseDate(direction === 1 ? start : end);
  const target = direction === 1 ? end : start;
  let count = 0;
  while (dateKey(cursor) < target) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const key = dateKey(cursor);
    if (!holidaySet.has(key) && cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      count += 1;
    }
  }
  return count * direction;
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

    const [postsResponse, processesResponse, resultsResponse, lotsResponse, linesResponse, mastersResponse, calendarResponse, referenceStartsResponse, schedulesResponse, subcontractorsResponse] =
      await Promise.all([
        supabaseAdmin
          .from("posts")
          .select("id,order_no,product_id,product_name,order_amount,delivery_date,delete")
          .eq("delete", false),
        supabaseAdmin.from("order_processes").select("*"),
        supabaseAdmin
          .from("production_results")
          .select("id,post_id,order_process_id,lot_id,process_name,date,amount")
          .gte("date", cutoffDate),
        supabaseAdmin.from("lots").select("id,deleted").eq("deleted", true),
        supabaseAdmin.from("line_master").select("*").eq("enabled", true),
        supabaseAdmin.from("process_master").select("id,process_id,name,outsourcing"),
        supabaseAdmin.from("company_calendar").select("date,is_holiday").eq("is_holiday", true),
        supabaseAdmin.from("ai_prediction_reference_starts").select("product_id,process_id,reference_start_date"),
        supabaseAdmin.from("production_schedules").select("post_id,order_no,press_number,shipping_scheduled_start,department,created_at").eq("department", "製造G").order("created_at", { ascending: false }),
        supabaseAdmin.from("subcontractors").select("id,name"),
      ]);

    const firstError = [postsResponse, processesResponse, resultsResponse, lotsResponse, linesResponse, mastersResponse, calendarResponse, referenceStartsResponse, schedulesResponse, subcontractorsResponse]
      .map((response) => response.error)
      .find(Boolean);
    if (firstError) throw firstError;

    const posts = (postsResponse.data || []) as DbRow[];
    const allProcesses = (processesResponse.data || []) as DbRow[];
    const deletedLotIds = new Set(
      ((lotsResponse.data || []) as DbRow[]).map((lot) => textValue(lot.id)),
    );
    const allResults = ((resultsResponse.data || []) as DbRow[]).filter(
      (result) => !result.lot_id || !deletedLotIds.has(textValue(result.lot_id)),
    );
    const lines = (linesResponse.data || []) as DbRow[];
    const processMasters = (mastersResponse.data || []) as DbRow[];
    const referenceStarts = (referenceStartsResponse.data || []) as DbRow[];
    const schedules = (schedulesResponse.data || []) as DbRow[];
    const subcontractors = (subcontractorsResponse.data || []) as DbRow[];
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
      const manufacturingSchedule = schedules.find(
        (schedule) =>
          textValue(schedule.post_id) === textValue(post.id) ||
          (!schedule.post_id && textValue(schedule.order_no) === textValue(post.order_no)),
      );
      const pressNumber = textValue(manufacturingSchedule?.press_number) || null;
      const plannedStartDate = textValue(manufacturingSchedule?.shipping_scheduled_start).slice(0, 10) || null;
      const currentProcessResults = resultsByProcess.get(textValue(process.id)) || [];
      const lastActualDate = currentProcessResults
        .map((result) => textValue(result.date).slice(0, 10))
        .filter(Boolean)
        .sort()
        .at(-1) || null;
      const productId = textValue(process.product_id) || textValue(post.product_id);
      const processMaster = processMasters.find(
        (master) => textValue(master.name) === processName,
      );
      const isOutsourcing = Boolean(process.subcontractor_id || processMaster?.outsourcing);
      const subcontractorId = textValue(process.subcontractor_id);
      const subcontractor = subcontractors.find(
        (item) => textValue(item.id) === subcontractorId,
      );
      const configuredReferenceStart = referenceStarts.find(
        (item) =>
          textValue(item.product_id) === productId &&
          textValue(item.process_id) === textValue(processMaster?.id),
      );
      const referenceStartDate = [
        cutoffDate,
        textValue(configuredReferenceStart?.reference_start_date).slice(0, 10),
      ].filter(Boolean).sort().at(-1) || cutoffDate;
      const priorityCutoff = new Date();
      priorityCutoff.setUTCDate(priorityCutoff.getUTCDate() - settings.priority_reference_days);
      const priorityCutoffDate = [dateKey(priorityCutoff), referenceStartDate].sort().at(-1) || referenceStartDate;

      if (remainingAmount > 0) activePostIds.add(textValue(post.id));

      const matchingHistoricalProcesses = allProcesses.filter(
        (candidate) => {
          const candidateSchedule = schedules.find(
            (schedule) =>
              textValue(schedule.post_id) === textValue(candidate.post_id) ||
              (!schedule.post_id && textValue(schedule.order_no) === textValue(candidate.order_no)),
          );
          const machineMatches =
            !isManufacturing ||
            !pressNumber ||
            textValue(candidateSchedule?.press_number) === pressNumber;
          const subcontractorMatches =
            !isOutsourcing ||
            !subcontractorId ||
            textValue(candidate.subcontractor_id) === subcontractorId;
          const candidateCompletedDate = isOutsourcing
            ? textValue(candidate.outsource_returned_date).slice(0, 10)
            : textValue(candidate.completed_date).slice(0, 10);
          return machineMatches && subcontractorMatches &&
          (productId
            ? textValue(candidate.product_id) === productId
            : textValue(candidate.product_name) === productName) &&
          textValue(candidate.process_name) === processName &&
          (!candidateCompletedDate || candidateCompletedDate >= referenceStartDate);
        },
      );
      const matchingResults = matchingHistoricalProcesses.flatMap(
        (candidate) => resultsByProcess.get(textValue(candidate.id)) || [],
      ).filter((result) => textValue(result.date).slice(0, 10) >= referenceStartDate);
      const allDailyTotals = new Map<string, number>();
      matchingResults.forEach((result) => {
        const day = textValue(result.date).slice(0, 10);
        allDailyTotals.set(day, (allDailyTotals.get(day) || 0) + numberValue(result.amount));
      });
      const sortedDailyTotals = [...allDailyTotals.entries()].sort(([left], [right]) => right.localeCompare(left));
      const dailyTotals = sortedDailyTotals.filter(([day]) => day >= priorityCutoffDate);
      if (dailyTotals.length < settings.manufacturing_min_business_days) {
        for (const entry of sortedDailyTotals) {
          if (dailyTotals.some(([day]) => day === entry[0])) continue;
          dailyTotals.push(entry);
          if (dailyTotals.length >= settings.manufacturing_min_business_days) break;
        }
      }
      const historyBusinessDays = dailyTotals.length;
      const completedHistoricalProcesses = matchingHistoricalProcesses.filter(
        (candidate) => Boolean(isOutsourcing ? candidate.outsource_returned_date : candidate.completed_date),
      ).sort((left, right) =>
        textValue(isOutsourcing ? right.outsource_returned_date : right.completed_date)
          .localeCompare(textValue(isOutsourcing ? left.outsource_returned_date : left.completed_date)),
      );
      const selectedCompletedProcesses = completedHistoricalProcesses.filter(
        (candidate) => textValue(isOutsourcing ? candidate.outsource_returned_date : candidate.completed_date).slice(0, 10) >= priorityCutoffDate,
      );
      if (selectedCompletedProcesses.length < settings.other_process_min_lots) {
        for (const candidate of completedHistoricalProcesses) {
          if (selectedCompletedProcesses.some((selected) => textValue(selected.id) === textValue(candidate.id))) continue;
          selectedCompletedProcesses.push(candidate);
          if (selectedCompletedProcesses.length >= settings.other_process_min_lots) break;
        }
      }
      const historySampleCount = selectedCompletedProcesses.length;
      const totalHistoricalAmount = dailyTotals.reduce((sum, [, amount]) => sum + amount, 0);
      const historicalDailyAmount = historyBusinessDays
        ? totalHistoricalAmount / historyBusinessDays
        : null;
      const durationSamples = selectedCompletedProcesses
        .map((candidate) => {
          const started = textValue(isOutsourcing ? candidate.outsource_sent_date : candidate.created_at).slice(0, 10);
          const completed = textValue(isOutsourcing ? candidate.outsource_returned_date : candidate.completed_date).slice(0, 10);
          if (!started || !completed) return null;
          return Math.max(1, Math.ceil((parseDate(completed).getTime() - parseDate(started).getTime()) / 86_400_000) + 1);
        })
        .filter((value): value is number => value != null);
      const historicalDurationDays = durationSamples.length
        ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
        : null;
      const historySufficient = isManufacturing
        ? historyBusinessDays >= settings.manufacturing_min_business_days
        : durationSamples.length >= settings.other_process_min_lots;

      const processCapacityRows = lines.filter(
        (line) =>
          textValue(line.process_id) === textValue(processMaster?.process_id) ||
          textValue(line.process_id) === textValue(processMaster?.id),
      );
      const matchingMachineCapacityRows = pressNumber
        ? processCapacityRows.filter((line) => textValue(line.line_name) === pressNumber)
        : [];
      const capacityRows = matchingMachineCapacityRows.length > 0
        ? matchingMachineCapacityRows
        : processCapacityRows;
      const comments: string[] = [];
      let sourceType: PredictionProcessInput["sourceType"] = "gemini";
      let capacityDailyAmount: number | null = null;
      let capacityOperationRate: number | null = null;

      if (
        (isOutsourcing && process.outsource_returned_date) ||
        (remainingAmount <= 0 && process.completed_date)
      ) {
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

      if (isManufacturing && !pressNumber) {
        comments.push("プレス機No未設定のため、設備の競合を考慮していません。");
      }
      if (isManufacturing && completedAmount <= 0 && (!plannedStartDate || plannedStartDate < getTodayInJapan())) {
        comments.push("製造開始予定日が未設定または過去日のため、更新日以降の営業日から予測しています。");
      }
      if (isOutsourcing && !subcontractorId) {
        sourceType = "unavailable";
        comments.push("外注先が未設定のため、予測できません。");
      }
      if (isOutsourcing && sourceType !== "actual" && !process.outsource_sent_date) {
        comments.push(`出し日未登録のため、予測条件（出し日${settings.outsource_default_sent_offset_days}営業日後・戻り日${settings.outsource_default_return_offset_days}営業日後）で予測しています。`);
      }

      inputs.push({
        postId: textValue(post.id),
        orderProcessId: textValue(process.id),
        orderNo: textValue(post.order_no),
        productName,
        deliveryDate: textValue(post.delivery_date).slice(0, 10),
        processName,
        processOrder: numberValue(process.process_order),
        pressNumber,
        plannedStartDate,
        lastActualDate,
        plannedAmount,
        completedAmount,
        remainingAmount,
        completedDate: textValue(
          isOutsourcing
            ? process.outsource_returned_date || process.completed_date
            : process.completed_date,
        ).slice(0, 10) || null,
        outsourcing: isOutsourcing,
        subcontractorName: textValue(subcontractor?.name) || null,
        outsourceSentDate: textValue(process.outsource_sent_date).slice(0, 10) || null,
        outsourceReturnedDate: textValue(process.outsource_returned_date).slice(0, 10) || null,
        referenceStartDate,
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

    const orderedGroups = [...grouped.values()].sort((left, right) => {
      const leftManufacturing = left.find((item) => item.processName.includes("製造"));
      const rightManufacturing = right.find((item) => item.processName.includes("製造"));
      const leftInProgress = Boolean(leftManufacturing && leftManufacturing.completedAmount > 0 && leftManufacturing.remainingAmount > 0);
      const rightInProgress = Boolean(rightManufacturing && rightManufacturing.completedAmount > 0 && rightManufacturing.remainingAmount > 0);
      if (leftInProgress !== rightInProgress) return leftInProgress ? -1 : 1;
      if (leftInProgress && rightInProgress) {
        const actualComparison = (rightManufacturing?.lastActualDate || "").localeCompare(leftManufacturing?.lastActualDate || "");
        if (actualComparison !== 0) return actualComparison;
      }
      const deliveryComparison = (left[0]?.deliveryDate || "").localeCompare(right[0]?.deliveryDate || "");
      if (deliveryComparison !== 0) return deliveryComparison;
      return (left[0]?.orderNo || "").localeCompare(right[0]?.orderNo || "");
    });

    const saved: SavedPrediction[] = [];
    const today = getTodayInJapan();
    const machineAvailableDate = new Map<string, string>();
    const machineBlockedByOrder = new Map<string, string>();
    let failedPosts = 0;
    for (const processInputs of orderedGroups) {
      processInputs.sort((a, b) => a.processOrder - b.processOrder);
      let cursor = shiftBusinessDays(today, 0, holidaySet);
      let postUnavailable = false;
      for (const input of processInputs) {
        let startDate = cursor;
        let defaultOutsourceScheduleShifted = false;
        let endDate: string | null = null;
        let status: SavedPrediction["status"] = "predicted";
        let reason = "";
        const comments = [...input.comments];
        const isManufacturing = input.processName.includes("製造");
        if (input.outsourcing && input.outsourceSentDate) {
          startDate = input.outsourceSentDate;
        } else if (input.outsourcing && input.subcontractorName) {
          const configuredSentDate = shiftBusinessDays(
            today,
            settings.outsource_default_sent_offset_days,
            holidaySet,
          );
          defaultOutsourceScheduleShifted = cursor > configuredSentDate;
          startDate = defaultOutsourceScheduleShifted ? cursor : configuredSentDate;
        }
        if (isManufacturing && input.plannedStartDate && input.plannedStartDate > startDate) {
          startDate = input.plannedStartDate;
        }
        if (isManufacturing && input.pressNumber) {
          const availableDate = machineAvailableDate.get(input.pressNumber);
          if (availableDate && availableDate > startDate) startDate = availableDate;
        }
        const blockingOrder = isManufacturing && input.pressNumber
          ? machineBlockedByOrder.get(input.pressNumber)
          : undefined;

        if (input.sourceType === "actual" && input.completedDate) {
          startDate = input.completedDate;
          endDate = input.completedDate;
          status = "confirmed";
          reason = "完了実績日を使用しています。";
        } else if (input.outsourcing && !input.outsourceSentDate && input.subcontractorName) {
          const outsourceLeadDays = Math.max(
            0,
            settings.outsource_default_return_offset_days -
              settings.outsource_default_sent_offset_days,
          );
          endDate = shiftBusinessDays(startDate, outsourceLeadDays, holidaySet);
          reason = `出し日未登録のため、予測条件（出し日${settings.outsource_default_sent_offset_days}営業日後・戻り日${settings.outsource_default_return_offset_days}営業日後）で予測しました。`;
          if (defaultOutsourceScheduleShifted) {
            comments.push("前工程の完了予測に合わせ、外注の出し日と戻り日を後ろへ調整しました。");
          }
        } else if (input.sourceType === "unavailable" || postUnavailable || blockingOrder) {
          status = "unavailable";
          startDate = cursor;
          const directFailureReason = comments.find((comment) =>
            comment.includes("予測できません") || comment.includes("複数登録されています"),
          );
          reason = blockingOrder
            ? `同じプレス機の先行注番 ${blockingOrder} が予測不能のため予測できません。`
            : postUnavailable
              ? "前工程が予測不能のため予測できません。"
              : directFailureReason || comments.at(-1) || "予測できません。";
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
            if (
              input.outsourcing &&
              input.outsourceSentDate &&
              !input.outsourceReturnedDate &&
              endDate < today
            ) {
              status = "unavailable";
              endDate = null;
              reason = "実績に基づく戻り予測日を超過しています。";
              comments.push("実績に基づく戻り予測日を超過しています。");
              postUnavailable = true;
            }
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
        if (isManufacturing && input.pressNumber) {
          if (endDate) {
            machineAvailableDate.set(
              input.pressNumber,
              nextDay(endDate, holidaySet, false),
            );
          } else if (status === "unavailable") {
            machineBlockedByOrder.set(input.pressNumber, input.orderNo);
          }
        }
        if (endDate) cursor = nextDay(endDate, holidaySet, false);
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

      const evaluationRows = [...grouped.entries()].flatMap(([postId, processInputs]) => {
        const postPredictions = saved
          .filter((item) => item.post_id === postId)
          .sort((left, right) => right.process_order - left.process_order);
        const finalPrediction = postPredictions[0];
        if (
          !finalPrediction?.predicted_end_date ||
          postPredictions.some((item) => item.status === "unavailable")
        ) return [];
        const orderNo = processInputs[0]?.orderNo || finalPrediction.order_no;
        return [{
          post_id: postId,
          order_no: orderNo,
          prediction_run_id: runId,
          predicted_completion_date: finalPrediction.predicted_end_date,
          legacy_completion_date: null,
          actual_completion_date: null,
          business_day_error: null,
          lead_business_days: countBusinessDays(today, finalPrediction.predicted_end_date, holidaySet),
        }];
      });
      if (evaluationRows.length > 0) {
        const { error: evaluationError } = await supabaseAdmin
          .from("ai_prediction_evaluations")
          .insert(evaluationRows);
        if (evaluationError) throw evaluationError;
      }
    }

    const completedOrders = posts.flatMap((post) => {
      const postProcesses = allProcesses
        .filter((process) => textValue(process.post_id) === textValue(post.id))
        .sort((left, right) => numberValue(right.process_order) - numberValue(left.process_order));
      const finalProcess = postProcesses[0];
      if (!finalProcess) return [];
      const plannedAmount = Math.max(numberValue(finalProcess.planned_amount), numberValue(post.order_amount));
      const actualCompletionDate = textValue(
        finalProcess.outsource_returned_date || finalProcess.completed_date,
      ).slice(0, 10);
      if (numberValue(finalProcess.completed_amount) < plannedAmount || !actualCompletionDate) return [];
      return [{ postId: textValue(post.id), actualCompletionDate }];
    });

    for (const completedOrder of completedOrders) {
      const { data: evaluations, error: evaluationFetchError } = await supabaseAdmin
        .from("ai_prediction_evaluations")
        .select("id,predicted_completion_date")
        .eq("post_id", completedOrder.postId)
        .is("actual_completion_date", null);
      if (evaluationFetchError) throw evaluationFetchError;
      for (const evaluation of evaluations || []) {
        const predictedDate = textValue(evaluation.predicted_completion_date).slice(0, 10);
        const { error: evaluationUpdateError } = await supabaseAdmin
          .from("ai_prediction_evaluations")
          .update({
            actual_completion_date: completedOrder.actualCompletionDate,
            business_day_error: predictedDate
              ? countBusinessDays(predictedDate, completedOrder.actualCompletionDate, holidaySet)
              : null,
          })
          .eq("id", evaluation.id);
        if (evaluationUpdateError) throw evaluationUpdateError;
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
