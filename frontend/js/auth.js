document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect appropriately
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        if (typeof isAdmin === 'function' && isAdmin()) {
            window.location.href = '/admin.html';
        } else {
            window.location.href = '/menu.html';
        }
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = message ? 'block' : 'none';
        }
    }

    function clearErrors() {
        document.querySelectorAll('.form-error').forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();
            let isValid = true;

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!email) {
                showError('emailError', 'Email is required');
                isValid = false;
            } else if (!isValidEmail(email)) {
                showError('emailError', 'Please enter a valid email address');
                isValid = false;
            }

            if (!password) {
                showError('passwordError', 'Password is required');
                isValid = false;
            } else if (password.length < 6) {
                showError('passwordError', 'Password must be at least 6 characters');
                isValid = false;
            }

            if (!isValid) return;

            const loginBtn = document.getElementById('loginBtn');
            setButtonLoading(loginBtn, true, 'Logging in...');

            try {
                const response = await api.post('/auth/login', { email, password });
                if (response.success) {
                    const userData = response.data?.user || response.user;
                    const tokenData = response.data?.token || response.token;
                    setToken(tokenData);
                    setUser(userData);
                    showToast('Login successful', 'success');
                    
                    const role = userData?.role;
                    if (role === 'ADMIN' || role === 'CANTEEN_STAFF') {
                        window.location.href = '/admin.html';
                    } else {
                        window.location.href = '/menu.html';
                    }
                } else {
                    showToast(response.message || 'Login failed', 'error');
                }
            } catch (error) {
                showToast(error.message || 'An error occurred during login', 'error');
            } finally {
                setButtonLoading(loginBtn, false, 'Login');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();
            let isValid = true;

            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const terms = document.getElementById('terms').checked;

            if (!name) {
                showError('nameError', 'Full Name is required');
                isValid = false;
            } else if (name.length < 2) {
                showError('nameError', 'Name must be at least 2 characters');
                isValid = false;
            }

            if (!email) {
                showError('emailError', 'Email is required');
                isValid = false;
            } else if (!isValidEmail(email)) {
                showError('emailError', 'Please enter a valid email address');
                isValid = false;
            }

            if (!password) {
                showError('passwordError', 'Password is required');
                isValid = false;
            } else if (password.length < 6) {
                showError('passwordError', 'Password must be at least 6 characters');
                isValid = false;
            }

            if (password !== confirmPassword) {
                showError('confirmPasswordError', 'Passwords do not match');
                isValid = false;
            }

            if (!terms) {
                showError('termsError', 'You must accept the Terms and Conditions');
                isValid = false;
            }

            if (!isValid) return;

            const registerBtn = document.getElementById('registerBtn');
            setButtonLoading(registerBtn, true, 'Creating Account...');

            try {
                const response = await api.post('/auth/register', { name, email, password });
                if (response.success) {
                    setToken(response.data.token);
                    setUser(response.data.user);
                    showToast('Registration successful', 'success');
                    window.location.href = '/menu.html';
                } else {
                    showToast(response.message || 'Registration failed', 'error');
                }
            } catch (error) {
                showToast(error.message || 'An error occurred during registration', 'error');
            } finally {
                setButtonLoading(registerBtn, false, 'Create Account');
            }
        });
    }
});
