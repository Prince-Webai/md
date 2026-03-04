
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: 'default' | 'wide' | 'xl';
    overflowVisible?: boolean;
}

const Modal = ({ isOpen, onClose, title, children, size = 'default', overflowVisible = false }: ModalProps) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    let maxWidthClass = 'max-w-2xl';
    if (size === 'wide') maxWidthClass = 'max-w-4xl';
    if (size === 'xl') maxWidthClass = 'max-w-6xl';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                ref={modalRef}
                className={`bg-white rounded-xl shadow-xl w-full ${maxWidthClass} max-h-[96vh] sm:max-h-[92vh] flex flex-col overflow-hidden transform transition-all animate-in zoom-in-95 duration-200`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex-none px-6 py-4 border-b bg-white rounded-t-xl flex items-center justify-between">
                    <h2 className="text-xl font-bold font-display text-gray-900 m-0">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className={`flex-1 ${overflowVisible ? 'overflow-visible' : 'overflow-y-auto'} p-6`}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
