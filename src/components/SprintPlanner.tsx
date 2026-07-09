import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { 
  Plus, 
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
  Circle
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

// Period Definitions
const PERIODS = [
  { id: 'Q3-26', label: 'Q3 2026', start: new Date(2026, 5, 29), end: new Date(2026, 8, 27) },
  { id: 'Q4-26', label: 'Q4 2026', start: new Date(2026, 8, 28), end: new Date(2027, 0, 3) },
  { id: 'Q1-27', label: 'Q1 2027', start: new Date(2027, 0, 4), end: new Date(2027, 2, 28) },
  { id: 'Q2-27', label: 'Q2 2027', start: new Date(2027, 2, 29), end: new Date(2027, 5, 27) },
  { id: 'Q3-27', label: 'Q3 2027', start: new Date(2027, 5, 28), end: new Date(2027, 8, 26) },
  { id: 'Q4-27', label: 'Q4 2027', start: new Date(2027, 8, 27), end: new Date(2028, 0, 2) },
];

const GLOBAL_START = new Date(2026, 5, 29); // Anchor for Sprint 1

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
        className="p-1.5 hover:bg-slate-200 rounded text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0"
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
        className="text-slate-300 opacity-0 group-hover:opacity-100 ml-2 cursor-pointer transition-opacity mr-2" 
        onClick={(e) => { e.stopPropagation(); onEdit(task); }}
      />
    </div>
  );
}

export default function SprintPlannerApp({ data, updateItem, deleteItem, insertItem, moveItem, followLink }: any) {
  // --- 1. STATE & REFS ---
  const [activePeriodId, setActivePeriodId] = useState('Q3-26');
  const [zoom, setZoom] = useState(60); 
  const [showBacklog, setShowBacklog] = useState(false);
  const [tooltip, setTooltip] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('All');

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const activePeriod = useMemo(() => PERIODS.find(p => p.id === activePeriodId) || PERIODS[0], [activePeriodId]);
  const rowHeight = 48;

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
    filteredTasks.filter((t: any) => t.start && t.durationDays !== null).sort((a: any, b: any) => a.index_ - b.index_), 
  [filteredTasks]);

  const backlogTasks = useMemo(() => 
    tasks.filter((t: any) => !t.start || isNaN(t.durationDays)), 
  [tasks]);

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
  const timeScale = d3.scaleTime().domain([minDate, maxDate]).range([0, chartWidth]);
  const today = new Date();
  const isTodayVisible = today >= minDate && today <= maxDate;

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
        .on("click", (event: any, d: any) => {
          setEditingItem(d);
          setIsModalOpen(true);
        })
        .on("mouseenter", function(event: any, d: any) {
          setTooltip({
            x: event.clientX,
            y: event.clientY,
            content: `${d.name}: Sprint ${Math.round((d.start.getTime() - GLOBAL_START.getTime()) / (14 * 86400000)) + 1}`
          });
        })
        .on("mouseleave", () => setTooltip(null));

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
            <div className="flex gap-2">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePeriodId(p.id)}
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter transition-colors ${
                    activePeriodId === p.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-slate-200 mx-1" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-400 uppercase">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
          >
            <option value="All">All Items</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          <button onClick={() => setZoom(z => Math.max(20, z - 10))} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[10px] font-black text-slate-400 w-10 text-center uppercase">{zoom}px</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex-1" />
        
        <button 
          onClick={followLink}
          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded-xl font-black text-xs flex items-center gap-2 active:scale-95 transition-transform"
        >
          OPEN SHEET
        </button>

        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95 transition-transform"
        >
          <Plus size={16} /> ADD TASK
        </button>

        <button 
          onClick={() => setShowBacklog(!showBacklog)}
          className={`px-4 py-2 border rounded-xl font-black text-xs flex items-center gap-2 transition-all ${
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
            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-full font-black text-[10px] flex items-center gap-1.5 hover:bg-red-100 transition-colors"
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
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l z-40 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-slate-700 flex items-center gap-2 uppercase text-xs tracking-tighter">
                <Clock size={16} className="text-amber-500" />
                Unscheduled Items
              </h3>
              <button onClick={() => setShowBacklog(false)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/20">
              {backlogTasks.map((task: any) => (
                <div 
                  key={task.id}
                  onClick={() => { setEditingItem(task); setIsModalOpen(true); }}
                  className="p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all cursor-pointer group bg-white"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-900 text-xl tracking-tighter">
                {editingItem ? 'Edit Task' : 'Define New Task'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Requirement Name</label>
                <input 
                  name="name" required 
                  defaultValue={editingItem?.name || ""}
                  className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700 transition-all placeholder:text-slate-300"
                  placeholder="Feature or Task Description"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Start On</label>
                  <input 
                    name="start" type="date" 
                    defaultValue={editingItem?.start ? d3.timeFormat("%Y-%m-%d")(editingItem.start) : ""}
                    className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Sprint Count</label>
                  <input 
                    name="duration" type="number" step="0.5" min="0.5" required 
                    defaultValue={editingItem?.duration || 1}
                    className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Evolution Status</label>
                <select 
                  name="status"
                  defaultValue={editingItem?.status || "In Progress"}
                  className="w-full px-5 py-3 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700"
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>
              <div className="pt-4 flex gap-4">
                {editingItem && (
                  <button 
                    type="button" 
                    onClick={() => { deleteItem(editingItem.index_); setIsModalOpen(false); }}
                    className="flex-none p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95">
                  SAVE EVOLUTION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tooltip && (
        <div 
          className="fixed z-[110] bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black pointer-events-none shadow-2xl border border-slate-700 animate-in fade-in zoom-in-90 duration-150 uppercase tracking-widest"
          style={{ left: tooltip.x + 15, top: tooltip.y - 45 }}
        >
          {tooltip.content}
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}
