import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

interface DatePickerProps {
    value: string; // YYYY-MM-DD
    onChange: (date: string) => void;
    required?: boolean;
    placeholder?: string;
}

const DatePicker = ({ value, onChange, required, placeholder = 'Select date...' }: DatePickerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value ? new Date(value + 'T00:00:00') : new Date());
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

    const todayStr = new Date().toISOString().split('T')[0];

    const prevMonth = (e: React.MouseEvent) => { e.stopPropagation(); setViewDate(new Date(year, month - 1, 1)); };
    const nextMonth = (e: React.MouseEvent) => { e.stopPropagation(); setViewDate(new Date(year, month + 1, 1)); };

    const selectDate = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(dateStr);
        setIsOpen(false);
    };

    const selectToday = (e: React.MouseEvent) => {
        e.stopPropagation();
        const today = new Date();
        onChange(today.toISOString().split('T')[0]);
        setViewDate(today);
        setIsOpen(false);
    };

    const clearDate = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setIsOpen(false);
    };

    // Position the dropdown using a portal so it never gets cut off by parent overflow
    const updatePosition = useCallback(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const dropdownWidth = 300;
            let left = rect.left + rect.width / 2 - dropdownWidth / 2;
            // Keep within viewport
            if (left < 8) left = 8;
            if (left + dropdownWidth > window.innerWidth - 8) left = window.innerWidth - dropdownWidth - 8;

            // Check if dropdown fits below, otherwise show above
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = 360; // approximate
            const top = spaceBelow > dropdownHeight
                ? rect.bottom + 8
                : rect.top - dropdownHeight - 8;

            setDropdownPos({ top, left });
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen, updatePosition]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Sync viewDate when value changes
    useEffect(() => {
        if (value) setViewDate(new Date(value + 'T00:00:00'));
    }, [value]);

    const formatDisplay = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);

    return (
        <>
            {/* Hidden native input for form validation */}
            {required && <input type="text" required value={value} onChange={() => { }} className="sr-only" tabIndex={-1} />}

            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-all text-left
                    ${isOpen
                        ? 'border-[#0A8043] ring-2 ring-[#0A8043]/10 bg-white'
                        : 'border-slate-300 bg-white hover:border-slate-400'
                    }
                `}
            >
                <span className={value ? 'text-slate-900 font-medium text-sm' : 'text-slate-400 text-sm'}>
                    {value ? formatDisplay(value) : placeholder}
                </span>
                <CalendarDays size={18} className={isOpen ? 'text-[#0A8043]' : 'text-slate-400'} />
            </button>

            {/* Portal-rendered Dropdown — renders at document body, never clipped by modal overflow */}
            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed w-[300px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
                    style={{
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        zIndex: 99999,
                        animation: 'fadeInUp 0.15s ease-out'
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#065F30] to-[#0A8043]">
                        <button type="button" onClick={prevMonth} className="p-1 text-white/70 hover:text-white rounded hover:bg-white/10 transition-colors">
                            <ChevronLeft size={18} />
                        </button>
                        <span className="text-white font-bold text-sm">{monthNames[month]} {year}</span>
                        <button type="button" onClick={nextMonth} className="p-1 text-white/70 hover:text-white rounded hover:bg-white/10 transition-colors">
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* Day labels */}
                    <div className="grid grid-cols-7 px-3 pt-2">
                        {dayLabels.map(d => (
                            <div key={d} className="text-center text-[11px] font-bold text-slate-400 py-1">{d}</div>
                        ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 px-3 pb-2 gap-y-0.5">
                        {days.map((day, i) => {
                            if (day === null) return <div key={`e-${i}`} />;
                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isToday = dateStr === todayStr;
                            const isSelected = dateStr === value;

                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => selectDate(day)}
                                    className={`w-9 h-9 mx-auto flex items-center justify-center rounded-lg text-sm font-medium transition-all
                                        ${isSelected
                                            ? 'bg-[#0A8043] text-white shadow-md shadow-blue-900/20 scale-105'
                                            : isToday
                                                ? 'bg-blue-50 text-[#0A8043] font-bold ring-1 ring-[#0A8043]/30'
                                                : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                                        }
                                    `}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-100 bg-slate-50/50">
                        <button type="button" onClick={clearDate} className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors">
                            Clear
                        </button>
                        <button type="button" onClick={selectToday} className="text-xs text-[#0A8043] hover:text-[#065F30] font-bold transition-colors">
                            Today
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default DatePicker;
