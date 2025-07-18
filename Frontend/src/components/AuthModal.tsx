import React, { useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, "defaultRole");
      }
      onClose();
      navigate("/home");
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-end justify-center px-3 sm:px-4 pt-4 pb-16 sm:pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        <div className="inline-block transform overflow-hidden rounded-lg bg-gray-800 px-3 sm:px-4 pt-4 sm:pt-5 pb-3 sm:pb-4 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6 sm:align-middle">
          <div className="absolute right-0 top-0 pr-3 sm:pr-4 pt-3 sm:pt-4">
            <button
              type="button"
              className="rounded-md text-gray-400 hover:text-gray-300"
              onClick={onClose}
            >
              <X className="h-5 sm:h-6 w-5 sm:w-6" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-2 sm:mt-3 w-full text-center sm:text-left">
              <h3 className="text-base sm:text-lg font-medium leading-6 text-white mb-4 sm:mb-6">
                {isLogin ? "Sign In" : "Create Account"}
              </h3>

              {error && (
                <div className="mb-3 sm:mb-4 rounded-md bg-red-500/10 border border-red-500 p-2 sm:p-3">
                  <p className="text-xs sm:text-sm text-red-500">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs sm:text-sm font-medium text-gray-300"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-sm h-9 sm:h-10"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs sm:text-sm font-medium text-gray-300"
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-sm h-9 sm:h-10"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-cyan-600 py-1.5 sm:py-2 px-4 text-sm font-medium text-white hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 h-9 sm:h-10"
                >
                  {loading
                    ? "Processing..."
                    : isLogin
                    ? "Sign In"
                    : "Create Account"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="mt-3 sm:mt-4 text-xs sm:text-sm text-cyan-500 hover:text-cyan-400 w-full text-center"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
