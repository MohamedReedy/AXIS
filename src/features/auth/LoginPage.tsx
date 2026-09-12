import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, Mail, User as UserIcon, AlertCircle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const LoginPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          setError('Please provide your full name');
          setLoading(false);
          return;
        }
        const { error: signUpError } = await signUp(email, password, fullName, studentId);
        if (signUpError) {
          setError(signUpError.message);
        } else {
          navigate('/admin');
        }
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError.message);
        } else {
          navigate(from);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row w-full bg-slate-50 selection:bg-axis-blue/20">
      {/* Left Column: AXIS Brand Showcase with Blue Gradient */}
      <div className="w-full lg:w-1/2 bg-gradient-to-br from-[#0B1120] via-[#003B94] to-[#0052D4] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        {/* Ambient lighting effects */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#00D2FF]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#0052D4]/30 rounded-full blur-3xl pointer-events-none" />

        {/* Top brand header */}
        <div className="relative z-10 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-lg shadow-black/20 flex-shrink-0">
            <img
              src="/axis-logo.png"
              alt="AXIS"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <span className="font-black text-xl tracking-tight block text-white">AXIS</span>
            <span className="text-[11px] text-cyan-200 uppercase tracking-widest font-bold">
              AI Excellence Innovation Sprint
            </span>
          </div>
        </div>

        {/* Center narrative / About AXIS */}
        <div className="relative z-10 my-10 lg:my-0 space-y-6 max-w-lg">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-cyan-200">
            <ShieldCheck className="w-4 h-4 text-[#00D2FF]" />
            <span>High-Integrity Examination Runtime</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
            Next-Gen Proctoring & Assessment Core.
          </h1>

          <p className="text-sm sm:text-base text-slate-200 font-medium leading-relaxed">
            AXIS delivers enterprise-grade browser lockdown, real-time violation telemetry, and automated evaluation engineered for academic excellence.
          </p>

          {/* Feature Highlights Cards */}
          <div className="space-y-3 pt-2">
            <div className="flex items-start space-x-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3.5">
              <div className="w-8 h-8 rounded-xl bg-[#00D2FF]/20 flex items-center justify-center flex-shrink-0 text-cyan-300">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Full-Screen Lockdown Protocol</h4>
                <p className="text-[11px] text-slate-300 leading-normal mt-0.5">
                  Automated window-blur and tab-switching violation enforcement with custom grace periods.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3.5">
              <div className="w-8 h-8 rounded-xl bg-[#00D2FF]/20 flex items-center justify-center flex-shrink-0 text-cyan-300">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Server Time Authority</h4>
                <p className="text-[11px] text-slate-300 leading-normal mt-0.5">
                  Synchronized server-authoritative timer and tamper-resistant item evaluation.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3.5">
              <div className="w-8 h-8 rounded-xl bg-[#00D2FF]/20 flex items-center justify-center flex-shrink-0 text-cyan-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Live Telemetry & Auditing</h4>
                <p className="text-[11px] text-slate-300 leading-normal mt-0.5">
                  Real-time candidate integrity logs, response breakdowns, and one-click spreadsheet matrix export.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom meta */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-300 border-t border-white/10 pt-6">
          <span>Sprint 2 • Mastery Core</span>
          <span className="font-mono text-[11px] text-cyan-200">v2.4 Production</span>
        </div>
      </div>

      {/* Right Column: Sign In Form with App Background */}
      <div className="w-full lg:w-1/2 bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          {/* Card Form */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-200/50 space-y-6">
            <div className="space-y-2 text-left">
              <span className="badge-pill badge-axis font-bold text-[11px]">
                {isSignUp ? 'New Registration' : 'Administrative Portal'}
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {isSignUp ? 'Create Admin Account' : 'Sign in to AXIS'}
              </h2>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {isSignUp
                  ? 'Register to manage exams, review attempts, and inspect telemetry.'
                  : 'Enter your credentials to access the examination control center.'}
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-2.5 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <>
                  <Input
                    label="Full Name"
                    type="text"
                    placeholder="e.g. Dr. Ahmed Hassan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                  <Input
                    label="Admin / Employee ID (Optional)"
                    type="text"
                    placeholder="e.g. ADM-102"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                </>
              )}

              <Input
                label="Email Address"
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button
                type="submit"
                size="lg"
                className="w-full flex items-center justify-center space-x-2 mt-4 bg-[#0052D4] hover:bg-[#0041A8] active:bg-[#00358A] text-white font-bold py-3 shadow-xs hover:shadow-md hover:brightness-105 transition-all cursor-pointer border border-[#0052D4]"
                isLoading={loading}
              >
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            <div className="pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-xs text-[#0052D4] hover:text-[#0041A8] font-bold transition-colors cursor-pointer"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>

          {/* Student Exam Notice */}
          <div className="callout-axis info text-center text-xs">
            <span className="font-bold">Student Notice:</span> Candidates taking an exam do not need an account — simply open the direct exam link provided by your examiner.
          </div>
        </div>
      </div>
    </div>
  );
};
