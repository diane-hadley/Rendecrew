"use client";

import { useEffect, useMemo, useState } from "react";
import {
  normalizeStartEndPair,
  shouldSyncEndToStart,
} from "@/lib/datetime-local";
import {
  APP_DEFAULT_TIME_ZONE,
  normalizeTimeZone,
  rezoneWallDatetimeLocal,
  utcToWallDatetimeLocal,
} from "@/lib/event-datetime";

export type EventWallDatetimeInitial = {
  startAt: Date | string | null;
  endAt: Date | string | null;
  startAtTimeZone: string;
  endAtTimeZone: string;
};

type EmptyConfig = {
  mode: "empty";
  defaultTimeZone: string;
};

type FromEventConfig = {
  mode: "from-event";
  initial: EventWallDatetimeInitial;
};

export function useEventWallDatetimeFields(
  config: EmptyConfig | FromEventConfig,
) {
  const rezoneOnTimezoneApply = config.mode === "from-event";

  const initialPair = useMemo(() => {
    if (config.mode === "empty") {
      return { start: "", end: "" };
    }
    const { initial } = config;
    const start = utcToWallDatetimeLocal(
      initial.startAt != null ? String(initial.startAt) : null,
      initial.startAtTimeZone,
    );
    const end = utcToWallDatetimeLocal(
      initial.endAt != null ? String(initial.endAt) : null,
      initial.endAtTimeZone,
    );
    return normalizeStartEndPair(start, end);
  }, [config]);

  const [startAt, setStartAt] = useState(initialPair.start);
  const [endAt, setEndAt] = useState(initialPair.end);

  const [startTz, setStartTz] = useState(() => {
    if (config.mode === "empty") {
      return normalizeTimeZone(config.defaultTimeZone, APP_DEFAULT_TIME_ZONE);
    }
    return normalizeTimeZone(
      config.initial.startAtTimeZone,
      APP_DEFAULT_TIME_ZONE,
    );
  });
  const [endTz, setEndTz] = useState(() => {
    if (config.mode === "empty") {
      return normalizeTimeZone(config.defaultTimeZone, APP_DEFAULT_TIME_ZONE);
    }
    const start = normalizeTimeZone(
      config.initial.startAtTimeZone,
      APP_DEFAULT_TIME_ZONE,
    );
    return normalizeTimeZone(config.initial.endAtTimeZone, start);
  });
  const [useSeparateEndTz, setUseSeparateEndTz] = useState(
    config.mode === "from-event"
      ? config.initial.startAtTimeZone !== config.initial.endAtTimeZone
      : false,
  );
  const [tzModalOpen, setTzModalOpen] = useState(false);

  const emptyDefaultTimeZone =
    config.mode === "empty" ? config.defaultTimeZone : null;

  useEffect(() => {
    if (emptyDefaultTimeZone == null) return;
    const normalized = normalizeTimeZone(
      emptyDefaultTimeZone,
      APP_DEFAULT_TIME_ZONE,
    );
    setStartTz(normalized);
    setEndTz(normalized);
  }, [emptyDefaultTimeZone]);

  function onStartChange(next: string) {
    setStartAt(next);
    setEndAt((prev) => (shouldSyncEndToStart(next, prev) ? next : prev));
  }

  function onTimezoneApply({
    startTimeZone,
    endTimeZone,
    useSeparateEndTimeZone,
  }: {
    startTimeZone: string;
    endTimeZone: string;
    useSeparateEndTimeZone: boolean;
  }) {
    if (rezoneOnTimezoneApply) {
      setStartAt((s) => rezoneWallDatetimeLocal(s, startTz, startTimeZone));
      setEndAt((e) =>
        rezoneWallDatetimeLocal(
          e,
          useSeparateEndTz ? endTz : startTz,
          useSeparateEndTimeZone ? endTimeZone : startTimeZone,
        ),
      );
    }
    setUseSeparateEndTz(useSeparateEndTimeZone);
    setStartTz(startTimeZone);
    setEndTz(endTimeZone);
  }

  const wallDatetimePayload = {
    startAt,
    endAt,
    startAtTimeZone: startTz,
    endAtTimeZone: useSeparateEndTz ? endTz : startTz,
  };

  return {
    startAt,
    endAt,
    startTz,
    endTz,
    useSeparateEndTz,
    tzModalOpen,
    setTzModalOpen,
    onStartChange,
    setEndAt,
    onTimezoneApply,
    wallDatetimePayload,
  };
}
