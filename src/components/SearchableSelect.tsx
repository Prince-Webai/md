import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

interface Option {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    allowCustom?: boolean;
    searchable?: boolean;
    label?: string;
    icon?: React.ReactNode;
    fullWidth?: boolean;
    required?: boolean;
    className?: string; // Add support for inner class overrides
}

const SearchableSelect = ({
    options,
    value,
    onChange,
    placeholder = "Select an option...",
    allowCustom = false,
    searchable = true,
    label,
    icon,
    fullWidth = true,
    required = false,
    className = '' // default empty
}: SearchableSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);
    const displayValue = selectedOption ? selectedOption.label : (allowCustom ? value : '');

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleCustomSubmit = () => {
        if (allowCustom && searchTerm.trim()) {
            onChange(searchTerm.trim());
            setIsOpen(false);
            setSearchTerm('');
        }
    };

    return (
        <div className={`${fullWidth ? 'w-full' : 'w-auto'} relative group`} ref={containerRef}>
            {label && (
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {label} {required && <span className="text-red-500">*</span>}
                </label>
            )}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between w-full transition-all cursor-pointer bg-white 
                    ${className || 'px-4 py-2.5 rounded-xl border shadow-sm'}
                    ${!className && isOpen ? 'border-delaval-blue ring-4 ring-delaval-blue/5 shadow-md' : ''}
                    ${!className && !isOpen ? 'border-slate-200 hover:border-slate-300 hover:shadow' : ''}
                `}
            >
                <div className="flex items-center gap-2.5 overflow-hidden">
                    {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
                    <span className={`text-sm truncate font-medium ${displayValue ? 'text-slate-900' : 'text-slate-400'}`}>
                        {displayValue || placeholder}
                    </span>
                </div>
                <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-delaval-blue' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute z-[100] w-full mt-2 bg-white rounded-2xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.12)] py-2 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                    {searchable && (
                        <div className="px-3 pb-2 border-b border-slate-50 flex items-center gap-2">
                            <Search size={14} className="text-slate-400" />
                            <input
                                autoFocus
                                type="text"
                                className="w-full py-1.5 text-sm outline-none placeholder:text-slate-400 font-medium"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCustomSubmit();
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <div className="max-h-[280px] overflow-y-auto pt-1 scrollbar-thin scrollbar-thumb-slate-200">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <div
                                    key={opt.value}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelect(opt.value);
                                    }}
                                    className={`px-4 py-2.5 text-sm flex items-center justify-between cursor-pointer transition-colors
                                        ${opt.value === value ? 'bg-blue-50/50 text-delaval-blue font-bold' : 'text-slate-700 hover:bg-slate-50'}
                                    `}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {opt.value === value && <Check size={14} className="shrink-0" />}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-4 text-center">
                                {allowCustom && searchTerm.trim() ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCustomSubmit();
                                        }}
                                        className="text-xs font-bold text-delaval-blue bg-blue-50 px-4 py-3 rounded-xl hover:bg-blue-100 border border-blue-200 w-full transition-all"
                                    >
                                        Use custom: "{searchTerm}"
                                    </button>
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-slate-400 py-2">
                                        <Search size={20} className="opacity-20" />
                                        <span className="text-xs italic">No matches found</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {allowCustom && !searchTerm && (
                        <div className="mt-1 px-4 py-2 border-t border-slate-50">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Type in box to add custom...
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
