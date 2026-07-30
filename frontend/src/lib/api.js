const getApiBase = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined') return '';
    return 'http://localhost:3002';
};

/**
 * Fetch wrapper with auth token and error handling.
 * - Auto-attaches Bearer token from localStorage
 * - Auto-sets Content-Type: application/json
 * - On 401: clears token, redirects to /login
 * - On error: throws Error with server message
 */
export async function fetchApi(path, options = {}) {
    const API_BASE = getApiBase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

    const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
    };

    if (isFormData) {
        delete headers['Content-Type'];
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    if (res.status === 401) {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        throw new Error('Session expired');
    }

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'An error occurred');
    }

    return data;
}
