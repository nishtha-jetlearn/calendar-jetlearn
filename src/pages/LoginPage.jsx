import React, { useState } from 'react';
import { FaEnvelope, FaLock, FaUser } from 'react-icons/fa';
import { AiFillEye, AiFillEyeInvisible } from 'react-icons/ai';
import jetlearn from '../assets/jetlearn.png';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(null);

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Basic validation
    if (!username || !email || !password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    // Validate specific credentials
    const validUsername = 'nishtha';
    const validEmail = 'nishtha.gupta@jet-learn.com';
    const validPassword = 'nishtha123';

    if (username !== validUsername || email !== validEmail || password !== validPassword) {
      setError('Invalid credentials.');
      setIsLoading(false);
      return;
    }

    try {
      // Create FormData for the API call
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      // Make API call to JetLearn login endpoint
      const response = await fetch('https://live.jetlearn.com/sync/login/', {
        method: 'POST',
        body: formData,
        headers: {
          'Cookie': 'sessionid=3rup33tegtbinw93t9x37wr0mob4drym'
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Check if the API response contains valid user data
        if (data.session_id) {
          // Store session_id for logout
          setSessionId(data.session_id);
          console.log('Session ID stored:', data.session_id);
          
          login({ 
            email: data.email || username + '@jet-learn.com', 
            name: data.username || username,
            id: data.id || Date.now().toString(),
            role: data.role || 'admin',
            sessionId: data.session_id
          });
        } else {
          setError('Invalid response from server. Please try again.');
        }
      } else {
        // Display error message from API
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left - Image */}
      <div className="hidden md:flex lg:w-1/2 bg-gradient-to-br from-gray-50 to-gray-100 items-center justify-center p-6 lg:p-12">
        <div className="max-w-sm lg:max-w-md w-full">
          <img 
            src={jetlearn}
            alt="Working"
            className="w-full h-auto rounded-xl lg:rounded-2xl shadow-xl"
          />
        </div>
      </div>

      {/* Right - Form */}
      <div className="w-full lg:w-1/2 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative">
        <div className="w-full max-w-sm sm:max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Jetlearn Calendar</h2>
              <p className="text-gray-600">Sign In to Get Started</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FaUser className="text-gray-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-500 text-sm"
                />
              </div>

              {/* Email */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FaEnvelope className="text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email Address"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-500 text-sm"
                />
              </div>



              {/* Password */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FaLock className="text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors duration-200 z-10"
                >
                  {showPassword ? <AiFillEyeInvisible size={18} /> : <AiFillEye size={18} />}
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing In...
                  </div>
                ) : (
                  'Login'
                )}
              </button>

              

              {/* Forgot Password */}
              {/* <div className="text-center">
                <button
                  type="button"
                  className="text-gray-600 hover:text-blue-600 text-sm"
                >
                  Forgot Password
                </button>
              </div> */}
            </form>
          </div>
        </div>

        {/* Circles */}
        <div className="absolute bottom-0 right-0 opacity-10 sm:opacity-20 overflow-hidden">
          <div className="w-32 h-32 sm:w-48 sm:h-48 lg:w-64 lg:h-64 rounded-full border-4 border-white transform translate-x-32 translate-y-32"></div>
          <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-48 lg:h-48 rounded-full border-4 border-white transform -translate-x-12 translate-y-8"></div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
