const getApiBase = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined') {
        if (window.location.port === '3000') {
            return 'http://localhost:3002';
        }
        return '';
    }
    return 'http://localhost:3002';
};

/**
 * Fetch wrapper with auth token and safe JSON/error handling.
 * - Auto-attaches Bearer token from localStorage
 * - Auto-sets Content-Type: application/json
 * - On 401: clears token, redirects to /login
 * - Safely handles non-JSON / HTML error pages without throwing raw JSON syntax errors
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

    const contentType = res.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
        try {
            data = await res.json();
        } catch (e) {
            const rawText = await res.text();
            throw new Error(`Phản hồi Server lỗi cấu trúc JSON (${res.status}): ${rawText.slice(0, 150)}`);
        }
    } else {
        const rawText = await res.text();
        if (!res.ok) {
            throw new Error(`Lỗi kết nối Server AI (${res.status} ${res.statusText}): Vui lòng kiểm tra lại backend server!`);
        }
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            throw new Error(`Server không trả về định dạng JSON (${res.status}): ${rawText.slice(0, 120)}`);
        }
    }

    if (!res.ok) {
        throw new Error(data.error || data.message || `Lỗi API (${res.status})`);
    }

    return data;
}
