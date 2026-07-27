'use client';
import { useState } from 'react';

export default function Toast({ toasts, removeToast }) {
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
                    {t.message}
                </div>
            ))}
        </div>
    );
}

let toastId = 0;
export function useToast() {
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'success') => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return { toasts, addToast, removeToast };
}
