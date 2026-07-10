import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { 
  Download,
  Plus, 
  Printer,
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  Clock,
  X,
  Edit2,
  CalendarDays,
  Target,
  GripVertical,
  LayoutGrid,
  Calendar,
  CheckCircle2,
  Circle,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Period = {
  id: string;
  label: string;
  start: Date;
  end: Date;
};

type PeriodRange = {
  startId: string;
  endId: string;
};

// Period Definitions
const DEFAULT_PERIODS: Period[] = [
  { id: 'Q3-26', label: 'Q3 2026', start: new Date(2026, 5, 29), end: new Date(2026, 8, 27) },
  { id: 'Q4-26', label: 'Q4 2026', start: new Date(2026, 8, 28), end: new Date(2027, 0, 3) },
  { id: 'Q1-27', label: 'Q1 2027', start: new Date(2027, 0, 4), end: new Date(2027, 2, 28) },
  { id: 'Q2-27', label: 'Q2 2027', start: new Date(2027, 2, 29), end: new Date(2027, 5, 27) },
  { id: 'Q3-27', label: 'Q3 2027', start: new Date(2027, 5, 28), end: new Date(2027, 8, 26) },
  { id: 'Q4-27', label: 'Q4 2027', start: new Date(2027, 8, 27), end: new Date(2028, 0, 2) },
];

const GLOBAL_START = new Date(2026, 5, 29); // Anchor for Sprint 1
const DEFAULT_ACTIVE_PERIOD_ID = 'Q3-26';
const PERIOD_RANGE_STORAGE_KEY = 'sprintPlannerPeriodRange';
const BASE_ZOOM_PIXELS_PER_DAY = 60;
const MIN_ZOOM_PERCENT = 10;
const MAX_ZOOM_PERCENT = 500;
const ZOOM_PERCENT_STEP = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const formatDate = d3.timeFormat("%Y-%m-%d");
const formatFileDate = d3.timeFormat("%Y%m%d");

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const parsePeriodId = (id: string) => {
  const match = /^Q([1-4])-(\d{2})$/.exec(id);
  if (!match) return null;
  return { quarter: Number(match[1]), year: 2000 + Number(match[2]) };
};

const periodSortValue = (id: string) => {
  const parsed = parsePeriodId(id);
  if (!parsed) return Number.NaN;
  return parsed.year * 4 + parsed.quarter;
};

const makePeriodId = (quarter: number, year: number) => `Q${quarter}-${String(year).slice(-2)}`;

const shiftPeriodId = (id: string, offset: number) => {
  const parsed = parsePeriodId(id);
  if (!parsed) return id;
  const shifted = parsed.year * 4 + (parsed.quarter - 1) + offset;
  const year = Math.floor(shifted / 4);
  const quarter = (shifted % 4) + 1;
  return makePeriodId(quarter, year);
};

const mondayOnOrBefore = (date: Date) => {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
};

const firstMondayOnOrAfter = (date: Date) => {
  const day = date.getDay();
  const offset = day === 0 ? 1 : (8 - day) % 7;
  return addDays(date, offset);
};

const getQuarterStart = (id: string) => {
  const parsed = parsePeriodId(id);
  if (!parsed) return new Date(DEFAULT_PERIODS[0].start);

  if (parsed.quarter === 1) {
    return firstMondayOnOrAfter(new Date(parsed.year, 0, 1));
  }

  return mondayOnOrBefore(new Date(parsed.year, (parsed.quarter - 1) * 3, 1));
};

const buildPeriod = (id: string): Period => {
  const parsed = parsePeriodId(id);
  if (!parsed) return DEFAULT_PERIODS[0];

  const defaultPeriod = DEFAULT_PERIODS.find((period) => period.id === id);
  if (defaultPeriod) return defaultPeriod;

  const start = getQuarterStart(id);
  const end = addDays(getQuarterStart(shiftPeriodId(id, 1)), -1);
  return {
    id,
    label: `Q${parsed.quarter} ${parsed.year}`,
    start,
    end,
  };
};

const getStoredPeriodRange = (): PeriodRange => {
  const fallback = { startId: DEFAULT_PERIODS[0].id, endId: DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1].id };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(PERIOD_RANGE_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    const startId = typeof parsed?.startId === 'string' ? parsed.startId : fallback.startId;
    const endId = typeof parsed?.endId === 'string' ? parsed.endId : fallback.endId;

    if (!parsePeriodId(startId) || !parsePeriodId(endId)) return fallback;
    if (periodSortValue(startId) > periodSortValue(endId)) return fallback;

    return { startId, endId };
  } catch {
    return fallback;
  }
};

const buildPeriodRange = (range: PeriodRange) => {
  const periods: Period[] = [];
  let currentId = range.startId;

  while (periodSortValue(currentId) <= periodSortValue(range.endId)) {
    periods.push(buildPeriod(currentId));
    currentId = shiftPeriodId(currentId, 1);
  }

  return periods;
};

const escapeCsvCell = (value: any) => {
  const cell = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

// --- SORTABLE ITEM COMPONENT ---
function SortableTaskItem({ task, onEdit, isEditing }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.4 : 1,
  };

  const isDone = String(task.status).toLowerCase() === 'done';

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`h-[48px] border-b flex items-center px-2 group transition-all duration-200 ${
        isDragging ? 'bg-blue-50 shadow-inner' : 'hover:bg-white bg-slate-50/40'
      } ${isEditing ? 'ring-2 ring-blue-500 ring-inset bg-white' : ''}`}
    >
      <button 
        {...attributes} 
        {...listeners}
        className="p-1.5 hover:bg-slate-200 rounded text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 ui-interactive ui-focus-ring"
        aria-label={`Reorder ${String(task.name)}`}
      >
        <GripVertical size={14} />
      </button>
      <div 
        onClick={() => onEdit(task)}
        className="flex-1 flex items-center ml-1 overflow-hidden cursor-pointer h-full"
      >
        <div className="mr-3 shrink-0">
          {isDone ? <CheckCircle2 size={16} className="text-green-500" /> : <Circle size={16} className="text-slate-300" />}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-semibold truncate ${isDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
            {String(task.name)}
          </span>
          {task.duration && (
            <span className="text-[9px] font-bold text-slate-400 uppercase">
              {Math.round(task.duration * 10) / 10} Sprint(s)
            </span>
          )}
        </div>
      </div>
      <Edit2
        size={12}
        className="text-slate-300 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ml-2 cursor-pointer transition-opacity mr-2"
        onClick={(e) => { e.stopPropagation(); onEdit(task); }}
      />
    </div>
  );
}

export default function SprintPlannerApp({ data, updateItem, deleteItem, insertItem, moveItem, followLink }: any) {
  // --- 1. STATE & REFS ---
  const [periodRange, setPeriodRange] = useState<PeriodRange>(getStoredPeriodRange);
  const [activePeriodId, setActivePeriodId] = useState(DEFAULT_ACTIVE_PERIOD_ID);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [showBacklog, setShowBacklog] = useState(false);
  const [tooltip, setTooltip] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [isPrintMode, setIsPrintMode] = useState(false);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const periods = useMemo(() => buildPeriodRange(periodRange), [periodRange]);
  const activePeriod = useMemo(() => periods.find(p => p.id === activePeriodId) || periods[0] || DEFAULT_PERIODS[0], [activePeriodId, periods]);
  const zoom = BASE_ZOOM_PIXELS_PER_DAY * zoomPercent / 100;
  const rowHeight = 48;

  useEffect(() => {
    try {
      window.localStorage.setItem(PERIOD_RANGE_STORAGE_KEY, JSON.stringify(periodRange));
    } catch {
      // Ignore storage failures; the quarter controls still work for the current session.
    }
  }, [periodRange]);

  useEffect(() => {
    const handleAfterPrint = () => setIsPrintMode(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // --- 2. DATA PARSING ---
  const { tasks, headersMap } = useMemo(() => {
    if (!data || data.length === 0) return { tasks: [], headersMap: {} };

    const headerRow = data[0].row;
    const findIdx = (keywords: string[]) => headerRow.findIndex((cell: any) => 
      keywords.some(k => String(cell || "").toLowerCase().includes(k))
    );

    const h = {
      name: findIdx(["task", "name", "activity"]),
      start: findIdx(["start"]),
      duration: findIdx(["duration", "days", "sprint"]),
      status: findIdx(["status", "state", "progress", "category"]),
    };

    const parsed = data.slice(1)
      .filter((item: any) => item.row && item.row.some((c: any) => c !== null && c !== ""))
      .map((item: any) => {
        const name = String(item.row[h.name] || `Task ${item.index_}`);
        const startStr = item.row[h.start];
        const durationVal = parseFloat(item.row[h.duration]);

        let startDate = null;
        if (startStr) {
          const d = new Date(startStr);
          if (!isNaN(d.getTime())) {
            startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          }
        }

        const durationInSprints = isNaN(durationVal) ? null : durationVal / 14;
        const status = (h.status !== -1 && item.row[h.status]) ? String(item.row[h.status]).trim() : "In Progress";
        
        let endDate = null;
        if (startDate && !isNaN(durationVal)) {
          endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + Math.max(0, durationVal - 1));
        }

        return {
          id: item.id || item.index_.toString(),
          index_: item.index_,
          name,
          start: startDate,
          duration: durationInSprints,
          durationDays: durationVal,
          end: endDate,
          status,
          raw: item.row
        };
      });

    return { tasks: parsed, headersMap: h as any };
  }, [data]);

  // Derived filtered views
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterStatus !== 'All') {
      result = result.filter((t: any) => t.status.toLowerCase() === filterStatus.toLowerCase());
    }
    return result;
  }, [tasks, filterStatus]);

  const scheduledTasks = useMemo(() => 
    filteredTasks.filter((t: any) => t.start && t.end && Number.isFinite(t.durationDays)).sort((a: any, b: any) => a.index_ - b.index_),
  [filteredTasks]);

  const backlogTasks = useMemo(() => 
    tasks.filter((t: any) => !t.start || isNaN(t.durationDays)), 
  [tasks]);

  const currentViewTasks = useMemo(() =>
    scheduledTasks.filter((t: any) => t.start <= activePeriod.end && t.end >= activePeriod.start),
  [scheduledTasks, activePeriod]);

  // --- 3. SCALES & BOUNDS ---
  const { minDate, maxDate, totalDays } = useMemo(() => {
    // We anchor bounds primarily to the selected period, but ensure buffer
    const start = new Date(activePeriod.start.getFullYear(), activePeriod.start.getMonth(), activePeriod.start.getDate() - 14);
    const end = new Date(activePeriod.end.getFullYear(), activePeriod.end.getMonth(), activePeriod.end.getDate() + 14);
    
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return { minDate: start, maxDate: end, totalDays: diff };
  }, [activePeriod]);

  const chartWidth = totalDays * zoom;
  const chartHeight = scheduledTasks.length * rowHeight;
  const timeScale = useMemo(() => d3.scaleTime().domain([minDate, maxDate]).range([0, chartWidth]), [minDate, maxDate, chartWidth]);
  const today = useMemo(() => new Date(), []);
  const isTodayVisible = today >= minDate && today <= maxDate;
  const printSprints = useMemo(() => {
    const sprints: Array<{ start: Date; label: string; left: number }> = [];
    const domainStart = activePeriod.start.getTime();
    const domainEnd = d3.timeDay.offset(activePeriod.end, 1).getTime();
    const domainDuration = domainEnd - domainStart || DAY_MS;

    d3.timeDay.range(activePeriod.start, d3.timeDay.offset(activePeriod.end, 1), 14).forEach((start) => {
      const sprintNumber = Math.round((start.getTime() - GLOBAL_START.getTime()) / (14 * DAY_MS)) + 1;
      sprints.push({
        start,
        label: `S${sprintNumber}`,
        left: ((start.getTime() - domainStart) / domainDuration) * 100,
      });
    });

    return sprints;
  }, [activePeriod]);

  // --- 4. DND SENSORS & DRAG ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = scheduledTasks.findIndex((t: any) => t.id === active.id);
      const newIndex = scheduledTasks.findIndex((t: any) => t.id === over.id);
      
      const fromRealIndex = scheduledTasks[oldIndex].index_;
      const toRealIndex = scheduledTasks[newIndex].index_;
      
      moveItem(fromRealIndex, toRealIndex);
    }
  };

  // --- 5. SCROLL SYNC ---
  const handleScroll = (e: any) => {
    if (leftPaneRef.current) leftPaneRef.current.scrollTop = e.target.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = e.target.scrollLeft;
  };

  useEffect(() => {
    if (bodyRef.current) {
      const targetX = timeScale(activePeriod.start) - 100;
      bodyRef.current.scrollLeft = Math.max(0, targetX);
    }
  }, [activePeriodId, zoom, timeScale, activePeriod.start]);

  // --- 6. D3 TIMELINE LOGIC ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Sprint grid (14 days)
    const sprintGrid = d3.timeDay.range(minDate, d3.timeDay.offset(maxDate, 1), 14);
    const grid = svg.append("g").attr("class", "grid");
    
    grid.selectAll("line")
      .data(sprintGrid)
      .enter()
      .append("line")
      .attr("x1", d => timeScale(d))
      .attr("x2", d => timeScale(d))
      .attr("y1", 0)
      .attr("y2", Math.max(chartHeight, 1000))
      .attr("stroke", "#f1f5f9")
      .attr("stroke-width", 2);

    // Active Period Shade
    svg.append("rect")
      .attr("x", timeScale(activePeriod.start))
      .attr("width", timeScale(activePeriod.end) - timeScale(activePeriod.start))
      .attr("height", Math.max(chartHeight, 1000))
      .attr("fill", "#3b82f6")
      .attr("opacity", 0.02)
      .attr("pointer-events", "none");

    // Task Bars
    const barsContainer = svg.append("g").attr("class", "tasks");
    
    const dragBarBehavior = d3.drag<SVGGElement, any>()
      .on("start", function() {
        setTooltip(null);
        d3.select(this).raise().attr("opacity", 0.7);
      })
      .on("drag", function(event, d: any) {
        // Simple visual drag
        const dx = event.x - timeScale(d.start);
        d3.select(this).attr("transform", `translate(${dx}, 0)`);
      })
      .on("end", function(event, d: any) {
        d3.select(this).attr("opacity", 1);
        const newStartDate = timeScale.invert(event.x);
        const day = new Date(newStartDate.getFullYear(), newStartDate.getMonth(), newStartDate.getDate());
        
        const rowPatch: any[] = [];
        rowPatch[headersMap.start] = d3.timeFormat("%Y-%m-%d")(day);
        updateItem(d.index_, rowPatch);
      });

    const barGroups = barsContainer.selectAll(".bar-group")
      .data(scheduledTasks, (d: any) => d.id)
      .enter()
      .append("g")
        .attr("class", "bar-group")
        .attr("transform", (d: any, i: number) => `translate(0, ${i * rowHeight + 10})`)
        .style("cursor", "move")
        .call(dragBarBehavior as any);

    barGroups.append("rect")
        .attr("x", (d: any) => timeScale(d.start))
        .attr("width", (d: any) => Math.max(8, timeScale(d.end) - timeScale(d.start) + (zoom * 0.9)))
        .attr("height", rowHeight - 20)
        .attr("rx", 6)
        .attr("fill", (d: any) => String(d.status).toLowerCase() === 'done' ? '#22c55e' : '#3b82f6')
        .attr("stroke", (d: any) => String(d.status).toLowerCase() === 'done' ? '#166534' : '#1e40af')
        .attr("stroke-width", 1)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", (d: any) => `Edit ${String(d.name)}`)
        .style("transition", "filter 150ms ease, opacity 150ms ease")
        .on("click", (event: any, d: any) => {
          setEditingItem(d);
          setIsModalOpen(true);
        })
        .on("keydown", (event: any, d: any) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setEditingItem(d);
          setIsModalOpen(true);
        })
        .on("mouseenter", function(event: any, d: any) {
          d3.select(this).style("filter", "drop-shadow(0 8px 14px rgb(37 99 235 / 0.18))");
          setTooltip({
            x: event.clientX,
            y: event.clientY,
            content: `${d.name}: Sprint ${Math.round((d.start.getTime() - GLOBAL_START.getTime()) / (14 * 86400000)) + 1}`
          });
        })
        .on("mouseleave", function() {
          d3.select(this).style("filter", null);
          setTooltip(null);
        })
        .on("focus", function() {
          d3.select(this).style("filter", "drop-shadow(0 8px 14px rgb(37 99 235 / 0.18))");
        })
        .on("blur", function() {
          d3.select(this).style("filter", null);
        });

    // Today Line
    if (isTodayVisible) {
      svg.append("line")
        .attr("x1", timeScale(today))
        .attr("x2", timeScale(today))
        .attr("y1", 0)
        .attr("y2", Math.max(chartHeight, 1000))
        .attr("stroke", "#ef4444")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,2");
    }

  }, [scheduledTasks, zoom, minDate, maxDate, chartHeight, activePeriod, today, isTodayVisible, timeScale, headersMap, updateItem, rowHeight]);

  // --- 7. HANDLERS ---
  const handleSave = (e: any) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name');
    const start = fd.get('start');
    const sprints = parseFloat(fd.get('duration') as string);
    const status = fd.get('status');

    const rowPatch: any[] = [];
    rowPatch[headersMap.name] = name;
    rowPatch[headersMap.start] = start;
    rowPatch[headersMap.duration] = sprints * 14;
    if (headersMap.status !== -1) rowPatch[headersMap.status] = status;

    if (editingItem) {
      updateItem(editingItem.index_, rowPatch);
    } else {
      insertItem(undefined, rowPatch);
    }
    setIsModalOpen(false);
  };

  const jumpToToday = () => {
    if (bodyRef.current && isTodayVisible) {
      bodyRef.current.scrollLeft = timeScale(today) - bodyRef.current.clientWidth / 2;
    }
  };

  const addPreviousQuarter = () => {
    setPeriodRange((range) => ({ ...range, startId: shiftPeriodId(range.startId, -1) }));
  };

  const addNextQuarter = () => {
    setPeriodRange((range) => ({ ...range, endId: shiftPeriodId(range.endId, 1) }));
  };

  const decreaseZoom = () => {
    setZoomPercent((value) => Math.max(MIN_ZOOM_PERCENT, value - ZOOM_PERCENT_STEP));
  };

  const increaseZoom = () => {
    setZoomPercent((value) => Math.min(MAX_ZOOM_PERCENT, value + ZOOM_PERCENT_STEP));
  };

  const handleExportCsv = () => {
    const headers = [
      'Task Name',
      'Start Date',
      'End Date',
      'Duration Days',
      'Duration Sprints',
      'Status',
      'Source Row',
    ];

    const rows = currentViewTasks.map((task: any) => [
      task.name,
      task.start ? formatDate(task.start) : '',
      task.end ? formatDate(task.end) : '',
      Number.isFinite(task.durationDays) ? task.durationDays : '',
      Number.isFinite(task.duration) ? Math.round(task.duration * 10) / 10 : '',
      task.status,
      task.index_ + 1,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n');
    const statusSuffix = filterStatus === 'All' ? 'all' : filterStatus.toLowerCase().replace(/\s+/g, '-');
    const filename = `sprint-planner-${activePeriod.id}-${statusSuffix}-${formatFileDate(new Date())}.csv`;

    downloadTextFile(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  };

  const handleExportPdf = () => {
    setIsPrintMode(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const getPrintBarStyle = (task: any) => {
    const domainStart = activePeriod.start.getTime();
    const domainEnd = d3.timeDay.offset(activePeriod.end, 1).getTime();
    const taskStart = Math.max(domainStart, task.start.getTime());
    const taskEnd = Math.min(domainEnd, d3.timeDay.offset(task.end, 1).getTime());
    const domainDuration = domainEnd - domainStart || DAY_MS;
    const left = ((taskStart - domainStart) / domainDuration) * 100;
    const width = Math.max(1.5, ((taskEnd - taskStart) / domainDuration) * 100);

    return {
      left: `${Math.max(0, Math.min(100, left))}%`,
      width: `${Math.max(1.5, Math.min(100, width))}%`,
    };
  };

  // --- 8. RENDERERS ---
  const renderDoubleDeckerHeader = () => {
    const months = d3.timeMonth.range(minDate, maxDate);
    const sprints: any[] = [];
    let curr = new Date(GLOBAL_START);
    // Align base to grid
    while (curr > minDate) curr = d3.timeDay.offset(curr, -14);
    while (curr < maxDate) {
      const sStart = new Date(curr);
      const sEnd = d3.timeDay.offset(sStart, 14);
      const num = Math.round((sStart.getTime() - GLOBAL_START.getTime()) / (14 * 86400000)) + 1;
      sprints.push({ start: sStart, end: sEnd, num });
      curr = sEnd;
    }

    return (
      <svg width={chartWidth} height={96}>
        {months.map((m, i) => {
          const x = timeScale(m);
          const next = d3.timeMonth.offset(m, 1);
          const w = timeScale(next > maxDate ? maxDate : next) - x;
          return (
            <g key={`m-${i}`}>
              <rect x={x} y={0} width={w} height={48} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />
              <text x={x + 12} y={30} className="text-xs font-extrabold fill-slate-400 uppercase tracking-widest">
                {String(d3.timeFormat("%B %Y")(m))}
              </text>
            </g>
          );
        })}
        {sprints.map((s, i) => {
          const x = timeScale(s.start);
          const w = timeScale(s.end) - x;
          const isCurrentPeriod = s.start >= activePeriod.start && s.end <= d3.timeDay.offset(activePeriod.end, 1);
          return (
            <g key={`s-${i}`}>
              <rect 
                x={x} y={48} width={w} height={48} 
                fill={isCurrentPeriod ? "#eff6ff" : "white"} 
                stroke="#e2e8f0" strokeWidth={1}
              />
              <text x={x + w/2} y={68} textAnchor="middle" className={`text-[10px] font-black ${isCurrentPeriod ? 'fill-blue-600' : 'fill-slate-300'} uppercase`}>
                S{s.num}
              </text>
              <text x={x + w/2} y={82} textAnchor="middle" className="text-[9px] font-bold fill-slate-400">
                {d3.timeFormat("%d %b")(s.start)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-white text-slate-800 antialiased font-sans">
      
      {/* --- TOP TOOLBAR --- */}
      <div className="flex-none h-16 border-b flex items-center px-4 gap-4 z-30 bg-white shadow-sm">
        <div className="flex items-center gap-3 mr-4">
          <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-100">
            <CalendarDays size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter text-slate-900 leading-tight">Sprint Evolution</h1>
            <div className="flex items-center gap-1 max-w-[520px] overflow-x-auto custom-scrollbar pr-1">
              <button
                type="button"
                onClick={addPreviousQuarter}
                title="Add previous quarter"
                aria-label="Add previous quarter"
                className="w-6 h-6 flex-none flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 ui-interactive ui-focus-ring"
              >
                <ChevronLeft size={12} />
              </button>
              {periods.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePeriodId(p.id)}
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter flex-none ui-interactive ui-focus-ring ${
                    activePeriodId === p.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={addNextQuarter}
                title="Add next quarter"
                aria-label="Add next quarter"
                className="w-6 h-6 flex-none flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 ui-interactive ui-focus-ring"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-slate-200 mx-1" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-400 uppercase">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 font-bold ui-focus-ring"
          >
            <option value="All">All Items</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          <button
            onClick={decreaseZoom}
            disabled={zoomPercent <= MIN_ZOOM_PERCENT}
            title="Zoom out"
            aria-label="Zoom out"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed ui-interactive ui-focus-ring"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-[10px] font-black text-slate-400 w-12 text-center uppercase">{zoomPercent}%</span>
          <button
            onClick={increaseZoom}
            disabled={zoomPercent >= MAX_ZOOM_PERCENT}
            title="Zoom in"
            aria-label="Zoom in"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed ui-interactive ui-focus-ring"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={handleExportCsv}
          className="px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-xl font-black text-xs flex items-center gap-2 ui-interactive ui-focus-ring"
        >
          <Download size={16} /> CSV
        </button>

        <button
          onClick={handleExportPdf}
          className="px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-xl font-black text-xs flex items-center gap-2 ui-interactive ui-focus-ring"
        >
          <Printer size={16} /> PDF
        </button>
        
        <button 
          onClick={followLink}
          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded-xl font-black text-xs flex items-center gap-2 ui-interactive ui-focus-ring"
        >
          OPEN SHEET
        </button>

        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-100 ui-interactive ui-focus-ring"
        >
          <Plus size={16} /> ADD TASK
        </button>

        <button 
          onClick={() => setShowBacklog(!showBacklog)}
          className={`px-4 py-2 border rounded-xl font-black text-xs flex items-center gap-2 ui-interactive ui-focus-ring ${
            showBacklog ? 'bg-amber-50 border-amber-200 text-amber-700' : 'hover:bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <Clock size={16} />
          BACKLOG
          {backlogTasks.length > 0 && (
            <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md text-[9px]">
              {backlogTasks.length}
            </span>
          )}
        </button>

        {isTodayVisible && (
          <button 
            onClick={jumpToToday}
            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-full font-black text-[10px] flex items-center gap-1.5 hover:bg-red-100 ui-interactive ui-focus-ring"
          >
            <Target size={14} /> TODAY
          </button>
        )}
      </div>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT PANE: DRAGGABLE TASK LIST */}
        <div className="w-72 flex-none flex flex-col border-r bg-slate-50/40 z-20 shadow-xl overflow-hidden">
          <div className="h-24 flex-none border-b p-6 flex items-end bg-slate-100/20">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Priority Backlog</span>
          </div>
          <div ref={leftPaneRef} className="flex-1 overflow-hidden select-none">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={scheduledTasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
                {scheduledTasks.map((task: any) => (
                  <SortableTaskItem 
                    key={task.id} 
                    task={task} 
                    isEditing={editingItem?.id === task.id}
                    onEdit={(t: any) => { setEditingItem(t); setIsModalOpen(true); }}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {scheduledTasks.length === 0 && (
              <div className="p-12 text-center flex flex-col items-center gap-4">
                <LayoutGrid size={32} className="text-slate-200" />
                <p className="text-xs font-bold text-slate-300 italic uppercase">No tasks scheduled</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: TIMELINE GRID */}
        <div className="flex-1 flex flex-col relative z-10 min-w-0">
          <div ref={headerRef} className="h-24 flex-none overflow-hidden relative bg-white border-b select-none">
            {renderDoubleDeckerHeader()}
          </div>
          <div ref={bodyRef} onScroll={handleScroll} className="flex-1 overflow-auto relative bg-white custom-scrollbar">
            <div style={{ width: chartWidth, height: Math.max(chartHeight, 800) }} className="relative">
              <svg ref={svgRef} width={chartWidth} height={Math.max(chartHeight, 800)} className="block" />
            </div>
          </div>
        </div>

        {/* BACKLOG SIDEBAR */}
        {showBacklog && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l z-40 shadow-2xl flex flex-col ui-slide-in-right">
            <div className="p-6 border-b flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-slate-700 flex items-center gap-2 uppercase text-xs tracking-tighter">
                <Clock size={16} className="text-amber-500" />
                Unscheduled Items
              </h3>
              <button
                onClick={() => setShowBacklog(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 ui-interactive ui-focus-ring"
                aria-label="Close backlog"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/20">
              {backlogTasks.map((task: any) => (
                <div 
                  key={task.id}
                  onClick={() => { setEditingItem(task); setIsModalOpen(true); }}
                  className="p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-xl cursor-pointer group bg-white ui-interactive"
                >
                  <p className="font-black text-sm text-slate-800 mb-2 leading-tight">{String(task.name)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded uppercase">Missing Schedule</span>
                    <Plus size={14} className="text-slate-300 group-hover:text-blue-500" />
                  </div>
                </div>
              ))}
              {backlogTasks.length === 0 && (
                <div className="text-center p-12 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                    <Calendar size={20} className="text-slate-300" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 italic">Backlog is empty</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TASK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 ui-fade-up">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden ui-scale-in">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-900 text-xl tracking-tighter">
                {editingItem ? 'Edit Task' : 'Define New Task'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 ui-interactive ui-focus-ring"
                aria-label="Close task editor"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Requirement Name</label>
                <input 
                  name="name" required 
                  defaultValue={editingItem?.name || ""}
                  className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 font-bold text-slate-700 placeholder:text-slate-300 ui-focus-ring"
                  placeholder="Feature or Task Description"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Start On</label>
                  <input 
                    name="start" type="date" 
                    defaultValue={editingItem?.start ? d3.timeFormat("%Y-%m-%d")(editingItem.start) : ""}
                    className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 font-bold text-slate-700 ui-focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Sprint Count</label>
                  <input 
                    name="duration" type="number" step="0.5" min="0.5" required 
                    defaultValue={editingItem?.duration || 1}
                    className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 font-bold text-slate-700 ui-focus-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Evolution Status</label>
                <select 
                  name="status"
                  defaultValue={editingItem?.status || "In Progress"}
                  className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 font-bold text-slate-700 ui-focus-ring"
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>
              <div className="pt-4 flex gap-4">
                {editingItem && (
                  <button 
                    type="button" 
                    onClick={async () => {
                      const deleted = await deleteItem(editingItem.index_);
                      if (deleted) setIsModalOpen(false);
                    }}
                    className="flex-none p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 ui-interactive ui-focus-ring"
                    aria-label="Delete task"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 ui-interactive ui-focus-ring">
                  SAVE EVOLUTION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tooltip && (
        <div 
          className="fixed z-[110] bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black pointer-events-none shadow-2xl border border-slate-700 ui-scale-in uppercase tracking-widest"
          style={{ left: tooltip.x + 15, top: tooltip.y - 45 }}
        >
          {tooltip.content}
        </div>
      )}

      {isPrintMode && (
        <div className="print-export">
          <div className="print-export-header">
            <div>
              <h1>Sprint Evolution</h1>
              <p>
                {activePeriod.label} / {formatDate(activePeriod.start)} to {formatDate(activePeriod.end)}
              </p>
            </div>
            <div className="print-export-meta">
              <span>Status: {filterStatus}</span>
              <span>Tasks: {currentViewTasks.length}</span>
              <span>Exported: {formatDate(new Date())}</span>
            </div>
          </div>

          <div className="print-timeline">
            <div className="print-row print-axis-row">
              <div className="print-task-cell">Sprint</div>
              <div className="print-track print-axis-track">
                {printSprints.map((sprint) => (
                  <div
                    key={`${sprint.label}-${formatDate(sprint.start)}`}
                    className="print-sprint-marker"
                    style={{ left: `${sprint.left}%` }}
                  >
                    <span>{sprint.label}</span>
                    <small>{d3.timeFormat("%d %b")(sprint.start)}</small>
                  </div>
                ))}
              </div>
            </div>

            {currentViewTasks.map((task: any) => (
              <div key={task.id} className="print-row">
                <div className="print-task-cell">
                  <strong>{String(task.name)}</strong>
                  <span>
                    {formatDate(task.start)} to {formatDate(task.end)} / {Math.round(task.duration * 10) / 10} sprint(s)
                  </span>
                </div>
                <div className="print-track">
                  <div
                    className={`print-task-bar ${String(task.status).toLowerCase() === 'done' ? 'is-done' : ''}`}
                    style={getPrintBarStyle(task)}
                  >
                    {String(task.status)}
                  </div>
                </div>
              </div>
            ))}

            {currentViewTasks.length === 0 && (
              <div className="print-empty-state">No scheduled tasks match this quarter and status filter.</div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .print-export { display: none; }
        @media print {
          @page { size: landscape; margin: 12mm; }
          html, body, #root {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }
          #root > div {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden !important; }
          .print-export, .print-export * { visibility: visible !important; }
          .print-export {
            display: block !important;
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            min-height: 100%;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .print-export-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: 18px;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 14px;
          }
          .print-export-header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0;
          }
          .print-export-header p {
            margin: 4px 0 0;
            color: #475569;
            font-size: 12px;
            font-weight: 700;
          }
          .print-export-meta {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
            color: #475569;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .print-timeline {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
          }
          .print-row {
            display: grid;
            grid-template-columns: 240px 1fr;
            min-height: 44px;
            border-bottom: 1px solid #e2e8f0;
            break-inside: avoid;
          }
          .print-row:last-child { border-bottom: 0; }
          .print-axis-row { min-height: 54px; background: #f8fafc; }
          .print-task-cell {
            border-right: 1px solid #e2e8f0;
            padding: 8px 10px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
          }
          .print-task-cell strong {
            font-size: 10px;
            line-height: 1.25;
            font-weight: 900;
            color: #0f172a;
          }
          .print-task-cell span {
            margin-top: 3px;
            font-size: 8px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
          }
          .print-track {
            position: relative;
            min-height: 44px;
            background:
              repeating-linear-gradient(
                to right,
                transparent 0,
                transparent calc(100% / 7 - 1px),
                #e2e8f0 calc(100% / 7 - 1px),
                #e2e8f0 calc(100% / 7)
              );
          }
          .print-axis-track {
            min-height: 54px;
            background: #f8fafc;
          }
          .print-sprint-marker {
            position: absolute;
            top: 0;
            bottom: 0;
            border-left: 1px solid #cbd5e1;
            padding-left: 4px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
          }
          .print-sprint-marker span {
            font-size: 9px;
            font-weight: 900;
            color: #2563eb;
          }
          .print-sprint-marker small {
            font-size: 7px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
          }
          .print-task-bar {
            position: absolute;
            top: 10px;
            height: 24px;
            border-radius: 6px;
            background: #3b82f6;
            border: 1px solid #1e40af;
            color: #ffffff;
            display: flex;
            align-items: center;
            padding: 0 8px;
            font-size: 8px;
            font-weight: 900;
            text-transform: uppercase;
            overflow: hidden;
            white-space: nowrap;
          }
          .print-task-bar.is-done {
            background: #22c55e;
            border-color: #166534;
          }
          .print-empty-state {
            padding: 32px;
            text-align: center;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
          }
        }
      `}</style>
    </div>
  );
}
