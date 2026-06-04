"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Smartphone, Eye, EyeOff, Loader2, Building2, User } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { AxiosError } from "axios";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    taxId: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (form.name.length < 2) errors.name = "Name must be at least 2 characters";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email";
    if (form.password.length < 8) errors.password = "At least 8 characters";
    else if (!/[A-Z]/.test(form.password)) errors.password = "Must include an uppercase letter";
    else if (!/[0-9]/.test(form.password)) errors.password = "Must include a number";
    if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match";
    if (form.companyName.length < 2) errors.companyName = "Company name required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError("");
    setLoading(true);

    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        companyName: form.companyName,
        taxId: form.taxId || undefined,
      });
      router.replace("/tables");
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string }>;
      setError(
        axiosErr.response?.data?.error || "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-blue-100/50 border border-gray-100 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200 mb-3">
              <Smartphone size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tighter">
              SMART<span className="text-blue-600">POS</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">Create your account and first company</p>
          </div>

          {/* Global error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* --- Section: Account --- */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User size={14} className="text-blue-600" />
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  Your Account
                </span>
              </div>
              <div className="space-y-3">
                <Field
                  label="Full Name"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="John Doe"
                  error={fieldErrors.name}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@company.com"
                  error={fieldErrors.email}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={set("password")}
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      className={inputCls(!!fieldErrors.password)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
                  )}
                </div>
                <Field
                  label="Confirm Password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  placeholder="••••••••"
                  error={fieldErrors.confirmPassword}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* --- Section: Company --- */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={14} className="text-blue-600" />
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  Your Company
                </span>
              </div>
              <div className="space-y-3">
                <Field
                  label="Company Name"
                  value={form.companyName}
                  onChange={set("companyName")}
                  placeholder="Acme Corp"
                  error={fieldErrors.companyName}
                />
                <Field
                  label="Tax ID / NIT (optional)"
                  value={form.taxId}
                  onChange={set("taxId")}
                  placeholder="123456789-0"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4 font-medium">
          SmartPOS v1.0 &mdash; Professional Point of Sale
        </p>
      </div>
    </div>
  );
}

// ----- Helpers -----

function inputCls(hasError: boolean) {
  return `w-full px-4 py-3 rounded-xl border-2 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none transition-colors ${
    hasError
      ? "border-red-300 focus:border-red-500"
      : "border-gray-100 focus:border-blue-500"
  }`;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputCls(!!error)}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
