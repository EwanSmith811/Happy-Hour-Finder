"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Trash2, Plus, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { HappyHour } from "../types";

type DealCategory = "Beer" | "Wine" | "Cocktails" | "Food";
type Deal = { id: string; category: DealCategory; description: string };
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

interface DaySchedule {
  mode: "inherit" | "override";
  start?: string;
  end?: string;
  deals?: Deal[];
}

interface AddVenueModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (payload: {
    name: string;
    address: string;
    website?: string;
    weeklySchedule: Record<DayKey, DaySchedule>;
    selectedDays: Record<DayKey, boolean>;
    master: { start: string; end: string; deals: Deal[] };
  }) => void;
  // optional initial venue for editing user-provided venues
  initial?: {
    id?: string;
    name?: string;
    address?: string;
    website?: string;
    happyHours?: HappyHour[];
    weeklySchedule?: Record<DayKey, DaySchedule>;
    selectedDays?: Record<DayKey, boolean>;
    master?: { start?: string; end?: string; deals?: Deal[] };
  };
  onEdit?: (id: string, payload: {
    name: string;
    address: string;
    website?: string;
    weeklySchedule: Record<DayKey, DaySchedule>;
    selectedDays: Record<DayKey, boolean>;
    master: { start: string; end: string; deals: Deal[] };
  }) => void;
}

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKENDS: DayKey[] = ["Sat", "Sun"];

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeSelectedDefault(): Record<DayKey, boolean> {
  const m = {} as Record<DayKey, boolean>;
  for (const d of DAYS) m[d] = false;
  return m;
}

function makeWeeklyScheduleInherit(): Record<DayKey, DaySchedule> {
  const obj = {} as Record<DayKey, DaySchedule>;
  for (const d of DAYS) obj[d] = { mode: "inherit" };
  return obj;
}

function timeOptions30m() {
  return Array.from({ length: 48 }, (_, i) => {
    const hh = Math.floor(i / 2);
    const mm = i % 2 === 0 ? "00" : "30";
    const dt = new Date();
    dt.setHours(hh, Number(mm), 0, 0);
    const label = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const value = `${String(hh).padStart(2, "0")}:${mm}`;
    return { label, value };
  });
}

export default function AddVenueModal({ open, onClose, onAdd, initial, onEdit }: AddVenueModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");

  const [selectedDays, setSelectedDays] = useState<Record<DayKey, boolean>>(makeSelectedDefault);

  const [masterStart, setMasterStart] = useState("");
  const [masterEnd, setMasterEnd] = useState("");
  const [masterDeals, setMasterDeals] = useState<Deal[]>([]);

  const [usePerDay, setUsePerDay] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState<Record<DayKey, DaySchedule>>(makeWeeklyScheduleInherit);
  const [modalError, setModalError] = useState<string | null>(null);

  const [openDays, setOpenDays] = useState<Record<DayKey, boolean>>(() => {
    const m = {} as Record<DayKey, boolean>;
    for (const d of DAYS) m[d] = false;
    return m;
  });

  const timeOptions = useMemo(() => timeOptions30m(), []);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setName("");
      setAddress("");
      setWebsite("");
      setSelectedDays(makeSelectedDefault());

      setMasterStart("");
      setMasterEnd("");
      setMasterDeals([]);

      setUsePerDay(false);
      setWeeklySchedule(makeWeeklyScheduleInherit());

      setOpenDays(() => {
        const m = {} as Record<DayKey, boolean>;
        for (const d of DAYS) m[d] = false;
        return m;
      });
      setModalError(null);
    }
  }, [open]);

  // Initialize form from `initial` when opening for edit
  useEffect(() => {
    if (!open || !initial) return;
    setName(initial.name || "");
    setAddress(initial.address || "");
    setWebsite(initial.website || "");

    // If `initial` already has weeklySchedule/selectedDays/master, use them.
    // Otherwise, convert from legacy `happyHours` if present.
    if (initial.weeklySchedule && initial.selectedDays) {
      setSelectedDays(initial.selectedDays || makeSelectedDefault());
      setMasterStart(initial.master?.start || "");
      setMasterEnd(initial.master?.end || "");
      setMasterDeals(initial.master?.deals || []);
      // Default to unchecked when editing
      setUsePerDay(false);
      setWeeklySchedule(initial.weeklySchedule || makeWeeklyScheduleInherit());
    } else if (initial.happyHours && Array.isArray(initial.happyHours)) {
      // Convert happyHours array into selectedDays + weeklySchedule + master
      const hh: any[] = initial.happyHours;
      const sel = makeSelectedDefault();
      const weekly = makeWeeklyScheduleInherit();
      // pick first hh as master default
      const masterHH = hh[0];
      const mStart = masterHH?.startTime || "";
      const mEnd = masterHH?.endTime || "";
      const mDeals = Array.isArray(masterHH?.deals) ? masterHH.deals.map((d: any) => ({ id: uid('deal'), category: 'Beer' as DealCategory, description: String(d) })) : [];

      // Mark selected days and set overrides where entries differ from master
      for (const entry of hh) {
        const daysArr: string[] = Array.isArray(entry.days) ? entry.days : [];
        for (const d of daysArr) {
          const dayKey = (d || '').toString();
          if (DAYS.includes(dayKey as DayKey)) {
            sel[dayKey as DayKey] = true;
            const start = entry.startTime || mStart;
            const end = entry.endTime || mEnd;
            const deals = Array.isArray(entry.deals) ? entry.deals.map((x: any) => ({ id: uid('deal'), category: 'Beer' as DealCategory, description: String(x) })) : [];
            // If matches master, keep inherit, otherwise override
            if (start === mStart && end === mEnd && JSON.stringify((deals || []).map(d=>d.description)) === JSON.stringify(mDeals.map(d=>d.description))) {
              // inherit
            } else {
              weekly[dayKey as DayKey] = { mode: 'override', start, end, deals };
            }
          }
        }
      }

      setSelectedDays(sel);
      setMasterStart(mStart);
      setMasterEnd(mEnd);
      setMasterDeals(mDeals);
      // Default to unchecked when editing
      setUsePerDay(false);
      setWeeklySchedule(weekly);
    } else {
      // fallback
      setSelectedDays(initial.selectedDays || makeSelectedDefault());
      setMasterStart(initial.master?.start || "");
      setMasterEnd(initial.master?.end || "");
      setMasterDeals(initial.master?.deals || []);
      // Default to unchecked when editing
      setUsePerDay(false);
      setWeeklySchedule(initial.weeklySchedule || makeWeeklyScheduleInherit());
    }

    // reset openDays
    setOpenDays(() => {
      const m = {} as Record<DayKey, boolean>;
      for (const d of DAYS) m[d] = false;
      return m;
    });
  }, [open, initial]);

  // Initialize form if editing an existing venue
  useEffect(() => {
    if (!open || !("initial" in ({} as AddVenueModalProps))) return;
  }, [open]);

  // Auto-clear modal error after a short delay
  useEffect(() => {
    if (!modalError) return;
    const t = setTimeout(() => setModalError(null), 5000);
    return () => clearTimeout(t);
  }, [modalError]);

  if (!open) return null;

  const toggleDaySelected = (d: DayKey) => setSelectedDays((s) => ({ ...s, [d]: !s[d] }));

  const setGroup = (group: "weekdays" | "weekends" | "all") => {
    setSelectedDays((s) => {
      const next = { ...s };
      const keys = group === "weekdays" ? WEEKDAYS : group === "weekends" ? WEEKENDS : DAYS;
      const allOn = keys.every((k) => s[k]);
      keys.forEach((k) => (next[k] = !allOn));
      return next;
    });
  };

  const addMasterDeal = (category: DealCategory, description: string) => {
    const desc = description.trim();
    if (!desc) return;
    setMasterDeals((prev) => [...prev, { id: uid("deal"), category, description: desc }]);
  };

  const removeMasterDeal = (id: string) => setMasterDeals((prev) => prev.filter((d) => d.id !== id));

  const setDayOverride = (day: DayKey, enabled: boolean) => {
    setWeeklySchedule((prev) => {
      const next = { ...prev };
      if (!enabled) {
        next[day] = { mode: "inherit" };
      } else {
        const current = prev[day];
        const deals =
          (current.mode === "override" ? current.deals : undefined) ||
          masterDeals.map((x) => ({ ...x, id: uid("deal") }));
        next[day] = {
          mode: "override",
          start: current.mode === "override" ? current.start : masterStart,
          end: current.mode === "override" ? current.end : masterEnd,
          deals,
        };
      }
      return next;
    });
  };

  const resetDayToMaster = (day: DayKey) => setWeeklySchedule((prev) => ({ ...prev, [day]: { mode: "inherit" } }));

  const copyMasterDealsToDay = (day: DayKey) => {
    setWeeklySchedule((prev) => {
      const current = prev[day];
      if (current.mode !== "override") return prev;
      return {
        ...prev,
        [day]: {
          ...current,
          deals: masterDeals.map((x) => ({ ...x, id: uid("deal") })),
        },
      };
    });
  };

  const setDayTime = (day: DayKey, which: "start" | "end", value: string) => {
    setWeeklySchedule((prev) => {
      const current = prev[day];
      if (current.mode !== "override") return prev;
      return { ...prev, [day]: { ...current, [which]: value } };
    });
  };

  const setDayDeals = (day: DayKey, deals: Deal[]) => {
    setWeeklySchedule((prev) => {
      const current = prev[day];
      if (current.mode !== "override") return prev;
      return { ...prev, [day]: { ...current, deals } };
    });
  };

  const handleSave = async () => {
    const payload = {
      name: name.trim(),
      address: address.trim(),
      website: website.trim() || undefined,
      weeklySchedule,
      selectedDays,
      master: { start: masterStart, end: masterEnd, deals: masterDeals },
    };
    // Validation: name, address, at least one selected day, and times for each selected day
    const hasName = Boolean(payload.name);
    const hasAddress = Boolean(payload.address);
    const anySelected = Object.values(payload.selectedDays).some(Boolean);
    if (!hasName || !hasAddress) {
      setModalError('Name and address are required');
      return;
    }
    if (!anySelected) {
      setModalError('Select at least one day');
      return;
    }

    // For each selected day, ensure times are present either via override or master
    for (const d of DAYS) {
      if (!payload.selectedDays[d]) continue;
      const sch = payload.weeklySchedule[d];
      if (sch && sch.mode === 'override') {
        if (!sch.start || !sch.end) {
          setModalError(`Provide start/end for ${d}`);
          return;
        }
      } else {
        if (!payload.master.start || !payload.master.end) {
          setModalError(`Provide master start/end times`);
          return;
        }
      }
    }

    // If editing, call onEdit and await result; if adding, call onAdd and await result.
    try {
      if (initial && initial.id && onEdit) {
        const ok = await onEdit(initial.id, payload);
        if (!ok) return; // keep modal open on failure
      } else if (onAdd) {
        const ok = await onAdd(payload);
        if (!ok) return;
      } else {
        console.log("Venue payload:", payload);
      }
      setModalError(null);
      onClose();
    } catch (err) {
      console.error("Save handler error", err);
    }
  };

  const selectedCount = DAYS.filter((d) => selectedDays[d]).length;


  const modalContent = (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 z-[99998]" onClick={onClose} />

      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.16 }}
        className="relative z-[99999] w-full max-w-3xl bg-obsidian/100 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        style={{ height: "min(calc(100vh - 2rem), 900px)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Add Brewery"
      >
        
        {/* Header (not sticky, always visible) */}
        <div className="shrink-0 bg-obsidian/95 backdrop-blur border-b border-white/10">
          {/* Place modal error banner inside header so header remains first-child for light-mode styling */}
          {modalError && (
            <div className="absolute left-1/2 top-6 transform -translate-x-1/2 z-[100000]">
              <div className="max-w-xl bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3">
                <div className="flex-1 text-sm">{modalError}</div>
                <button
                  type="button"
                  onClick={() => setModalError(null)}
                  className="text-white/90 ml-2 px-2 py-1 rounded hover:bg-white/10"
                  aria-label="Dismiss error"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          <div className="flex items-start justify-between p-5">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white">Add Brewery</h3>
              <p className="text-sm text-gray-400 mt-1">
                Set a master schedule, then optionally override specific days.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-md text-gray-300 hover:text-white">
              <X />
            </button>
          </div>
        </div>

        {/* Body scrolls */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Your existing content below can stay the same */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                placeholder="Brewery name"
              />
            </Field>
            <Field label="Address">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                placeholder="Street address, city, state"
              />
            </Field>
            <Field label="Website (optional)">
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                placeholder="https://"
              />
            </Field>
          </div>

          <div className="mt-5">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm text-gray-300 font-medium">Applies to</div>
                <div className="text-xs text-gray-400 mt-1">
                  {selectedCount === 0 ? "Select at least one day." : `${selectedCount} day${selectedCount === 1 ? "" : "s"} selected`}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGroup("weekdays")}
                  className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-gray-200"
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  onClick={() => setGroup("weekends")}
                  className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-gray-200"
                >
                  Weekends
                </button>
                <button
                  type="button"
                  onClick={() => setGroup("all")}
                  className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-gray-200"
                >
                  All
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              {DAYS.map((d) => (
                <button
                  key={`day-${d}`}
                  type="button"
                  onClick={() => toggleDaySelected(d)}
                  className={`h-10 px-3 rounded-full border text-sm font-medium transition ${
                    selectedDays[d]
                      ? "bg-amber-metallic/25 border-amber-metallic text-white"
                      : "bg-white/5 border-white/10 text-gray-200"
                  }`}
                  title={d}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm text-gray-200 font-semibold">Master schedule</div>
                <div className="text-xs text-gray-400 mt-1">This is the default for all selected days.</div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={usePerDay}
                  onChange={(e) => setUsePerDay(e.target.checked)}
                  className="accent-amber-metallic"
                />
                Override specific days
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Start time">
                <select
                  value={masterStart}
                  onChange={(e) => setMasterStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                >
                  <option value="">Select start</option>
                  {timeOptions.map((t) => (
                    <option key={t.value} value={t.value} className="text-black">
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="End time">
                <select
                  value={masterEnd}
                  onChange={(e) => setMasterEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                >
                  <option value="">Select end</option>
                  {timeOptions.map((t) => (
                    <option key={t.value} value={t.value} className="text-black">
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <div className="text-sm text-gray-300 font-medium">Deals (optional)</div>
              <div className="text-xs text-gray-400 mt-1">Example: “$5 pints”, “Half-off apps”</div>

              <div className="mt-3">
                <MasterDealEditor deals={masterDeals} onAdd={addMasterDeal} onRemove={removeMasterDeal} />
              </div>
            </div>
          </div>

          <AnimatePresence>
            {usePerDay && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-6"
              >
                <div className="text-sm text-gray-200 font-semibold">Overrides</div>
                <div className="text-xs text-gray-400 mt-1">
                  Expand a day only if you want it to differ from the master schedule.
                </div>

                <div className="mt-3 space-y-2">
                  {DAYS.map((day) => {
                    const isSelected = selectedDays[day];
                    const sch = weeklySchedule[day];
                    const isOverride = sch.mode === "override";
                    const expanded = openDays[day];

                    return (
                      <div
                        key={day}
                        className={`rounded-2xl border ${
                          isSelected ? "border-white/12 bg-white/[0.02]" : "border-white/8 bg-white/[0.01] opacity-60"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenDays((m) => ({ ...m, [day]: !m[day] }))}
                          className="w-full flex items-center justify-between p-3"
                          disabled={!isSelected}
                          title={!isSelected ? "Select this day above to edit it" : ""}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-9 rounded-full bg-white/5 border border-white/10 text-white flex items-center justify-center text-sm font-semibold">
                              {day}
                            </div>
                            <div className="text-left">
                              <div className="text-sm text-white font-medium">
                                {isOverride ? "Custom schedule" : "Using master schedule"}
                              </div>
                              <div className="text-xs text-gray-400">
                                {isOverride
                                  ? `${sch.start || "?"} to ${sch.end || "?"}`
                                  : masterStart && masterEnd
                                  ? `${masterStart} to ${masterEnd}`
                                  : "Set master times above"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Override</span>
                              <input
                                type="checkbox"
                                checked={isOverride}
                                onChange={(e) => setDayOverride(day, e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                className="accent-amber-metallic"
                                disabled={!isSelected}
                              />
                            </div>
                            {expanded ? <ChevronUp className="text-gray-300" size={18} /> : <ChevronDown className="text-gray-300" size={18} />}
                          </div>
                        </button>

                        <AnimatePresence>
                          {expanded && isSelected && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.16 }}
                              className="px-3 pb-3"
                            >
                              {!isOverride ? (
                                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/3 border border-white/10">
                                  <div className="text-sm text-gray-300">This day uses the master schedule.</div>
                                  <button
                                    type="button"
                                    onClick={() => setDayOverride(day, true)}
                                    className="px-3 py-2 rounded-lg bg-white/6 border border-white/10 text-sm text-white"
                                  >
                                    Make custom
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-3 p-3 rounded-xl bg-white/3 border border-white/10">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Field label="Start time">
                                      <select
                                        value={sch.start || ""}
                                        onChange={(e) => setDayTime(day, "start", e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                                      >
                                        <option value="">Select start</option>
                                        {timeOptions.map((t) => (
                                          <option key={t.value} value={t.value} className="text-black">
                                            {t.label}
                                          </option>
                                        ))}
                                      </select>
                                    </Field>

                                    <Field label="End time">
                                      <select
                                        value={sch.end || ""}
                                        onChange={(e) => setDayTime(day, "end", e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic transition"
                                      >
                                        <option value="">Select end</option>
                                        {timeOptions.map((t) => (
                                          <option key={t.value} value={t.value} className="text-black">
                                            {t.label}
                                          </option>
                                        ))}
                                      </select>
                                    </Field>
                                  </div>

                                  <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                      <div className="text-sm text-gray-300 font-medium">Deals</div>
                                      <div className="text-xs text-gray-400 mt-1">Leave empty to have no deals on this day.</div>
                                    </div>

                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => copyMasterDealsToDay(day)}
                                        className="px-3 py-2 rounded-lg bg-white/6 border border-white/10 text-sm text-white"
                                      >
                                        Copy master deals
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resetDayToMaster(day)}
                                        className="px-3 py-2 rounded-lg bg-white/6 border border-white/10 text-sm text-white flex items-center gap-2"
                                      >
                                        <RotateCcw size={16} />
                                        Use master
                                      </button>
                                    </div>
                                  </div>

                                  <DayDealsEditor deals={sch.deals || []} onChange={(next) => setDayDeals(day, next)} />
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer (always visible) */}
        <div className="shrink-0 border-t border-white/10 bg-obsidian/95 backdrop-blur p-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-gray-400">
              Tip: Start with master schedule. Override only the few days that differ.
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white/6 text-gray-200 border border-white/10">
                Cancel
              </button>
              <button type="button" onClick={handleSave} className="px-4 py-2 rounded-lg bg-amber-metallic text-obsidian font-semibold">
                Save Venue
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-gray-300 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function MasterDealEditor({
  deals,
  onAdd,
  onRemove,
}: {
  deals: Deal[];
  onAdd: (cat: DealCategory, desc: string) => void;
  onRemove: (id: string) => void;
}) {
  const [cat, setCat] = useState<DealCategory>("Beer");
  const [desc, setDesc] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_140px] gap-2">
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value as DealCategory)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic"
        >
        
          <option value="Beer" className="text-black">
            Beer
          </option>
          <option value="Wine" className="text-black">
            Wine
          </option>
          <option value="Cocktails" className="text-black">
            Cocktails
          </option>
          <option value="Food" className="text-black">
            Food
          </option>
        </select>

        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="e.g. $5 pints"
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic"
        />

        <button
          type="button"
          onClick={() => {
            const v = desc.trim();
            if (!v) return;
            onAdd(cat, v);
            setDesc("");
          }}
          className="px-3 py-2 rounded-lg bg-amber-metallic text-obsidian font-semibold flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Add deal
        </button>
      </div>

      {deals.length > 0 && (
        <div className="space-y-2">
          {deals.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-white">
                  <span className="font-semibold">{d.category}:</span>{" "}
                  <span className="text-gray-200">{d.description}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:text-white"
                title="Remove deal"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayDealsEditor({
  deals,
  onChange,
}: {
  deals: Deal[];
  onChange: (next: Deal[]) => void;
}) {
  const addEmpty = () => {
    onChange([...deals, { id: uid("deal"), category: "Beer", description: "" }]);
  };

  const update = (id: string, patch: Partial<Deal>) => {
    onChange(deals.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const remove = (id: string) => {
    onChange(deals.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-2">
      {deals.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-3">
          <div className="text-sm text-gray-300">No deals for this day.</div>
          <button
            type="button"
            onClick={addEmpty}
            className="px-3 py-2 rounded-lg bg-white/6 border border-white/10 text-sm text-white flex items-center gap-2"
          >
            <Plus size={16} />
            Add a deal
          </button>
        </div>
      ) : (
        <>
          {deals.map((d) => (
            <div key={d.id} className="grid grid-cols-1 md:grid-cols-[140px_1fr_44px] gap-2 items-center rounded-xl bg-white/5 border border-white/10 p-2">
              <select
                value={d.category}
                onChange={(e) => update(d.id, { category: e.target.value as DealCategory })}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic"
              >
                <option value="Beer" className="text-black">Beer</option>
                <option value="Wine" className="text-black">Wine</option>
                <option value="Cocktails" className="text-black">Cocktails</option>
                <option value="Food" className="text-black">Food</option>
              </select>

              <input
                value={d.description}
                onChange={(e) => update(d.id, { description: e.target.value })}
                placeholder="Deal description"
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-amber-metallic"
              />

              <button
                type="button"
                onClick={() => remove(d.id)}
                className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:text-white flex items-center justify-center"
                title="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addEmpty}
            className="w-full px-3 py-2 rounded-lg bg-white/6 border border-white/10 text-sm text-white flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Add another deal
          </button>
        </>
      )}
    </div>
  );
}
