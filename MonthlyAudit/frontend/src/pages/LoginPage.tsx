import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ShieldCheck, Activity, FileCheck2, Lock } from "lucide-react";
import { HeroShaderCanvas } from "../components/HeroShaderCanvas";
import { apiFetch } from "../lib/api";
import type { UserProfile } from "../types/audit";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            hd?: string;
          }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface LoginPageProps {
  onSuccess: (user: UserProfile) => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mouse Parallax 3D Card
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [6, -6]), { stiffness: 180, damping: 24 });
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-6, 6]), { stiffness: 180, damping: 24 });

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const initGoogle = () => {
      if (!window.google || !googleBtnRef.current || !clientId) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        hd: "softlanti.com.br",
        callback: async (response) => {
          setLoading(true);
          setError(null);
          try {
            const data = await apiFetch<{ user: UserProfile }>("/api/v1/auth/google", {
              method: "POST",
              body: JSON.stringify({ credential: response.credential }),
            });
            onSuccess(data.user);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Acesso negado.");
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        width: 310,
        text: "signin_with",
      });
    };

    const timer = setInterval(() => {
      if (window.google) {
        clearInterval(timer);
        initGoogle();
      }
    }, 200);

    return () => clearInterval(timer);
  }, [onSuccess]);

  return (
    <div
      className="relative min-h-screen flex flex-col justify-between px-6 py-10 bg-grain"
      onMouseMove={(e) => {
        mouseX.set(e.clientX - window.innerWidth / 2);
        mouseY.set(e.clientY - window.innerHeight / 2);
      }}
    >
      <HeroShaderCanvas />

      {/* Top Kinetic Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-7xl w-full mx-auto flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff5a1f] to-[#b83709] flex items-center justify-center font-black text-white text-lg bloom-orange">
            S
          </div>
          <div>
            <span className="font-extrabold tracking-[0.14em] text-white text-base block leading-none">
              SOFTLAN <span className="text-[#ff5a1f]">TI</span>
            </span>
            <span className="text-[10px] tracking-[0.24em] text-slate-400 uppercase">
              Soluções em Tecnologia
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-xs font-mono text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          TELEMETRIA & AUDITORIA v2.6
        </div>
      </motion.header>

      {/* Center Hero Section */}
      <main className="max-w-7xl w-full mx-auto grid lg:grid-cols-12 gap-12 items-center my-auto py-12">
        <div className="lg:col-span-7 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff5a1f]/15 border border-[#ff5a1f]/35 text-[#ff7b47] text-xs font-semibold tracking-wider uppercase"
          >
            <Activity className="w-3.5 h-3.5" />
            Governança • Provimento CNJ • Continuidade
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-[1.04]"
          >
            Auditoria técnica de{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5a1f] via-[#ff8759] to-slate-200">
              precisão executiva.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed"
          >
            Consolidação automatizada de chamados GLPI, cronogramas de adequação ao Provimento CNJ,
            telemetria de endpoints Bitdefender GravityZone e auditoria de backups em nuvem em um
            único dossiê PDF padronizado.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.38 }}
            className="grid grid-cols-3 gap-4 pt-2 max-w-xl"
          >
            {[
              { icon: ShieldCheck, label: "GravityZone", sub: "Segurança Ativa" },
              { icon: FileCheck2, label: "Provimento CNJ", sub: "Trilha Auditável" },
              { icon: Activity, label: "Backblaze & Zabbix", sub: "SLA Contínuo" },
            ].map((item) => (
              <div key={item.label} className="squircle-card p-3.5">
                <item.icon className="w-4 h-4 text-[#ff5a1f] mb-1.5" />
                <div className="text-xs font-bold text-white">{item.label}</div>
                <div className="text-[11px] text-slate-400">{item.sub}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Parallax Auth Card */}
        <motion.div
          style={{ rotateX, rotateY, transformPerspective: 1100 }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5"
        >
          <div className="squircle-card p-8 sm:p-10 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-[#ff5a1f]/20 blur-3xl pointer-events-none" />

            <div className="flex items-center gap-2 text-xs font-mono text-[#ff7b47] uppercase tracking-widest mb-3">
              <Lock className="w-3.5 h-3.5" />
              Acesso Corporativo Restrito
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Portal de Auditoria</h2>
            <p className="text-sm text-slate-400 mb-8">
              Autentique-se utilizando sua conta institucional{" "}
              <span className="text-slate-200 font-semibold">@softlanti.com.br</span> no Google
              Workspace.
            </p>

            <div className="flex flex-col items-center justify-center py-4 px-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <div ref={googleBtnRef} className="min-h-[44px] flex items-center justify-center" />
              {loading && (
                <span className="mt-3 text-xs font-mono text-[#ff7b47] animate-pulse">
                  Validando credenciais Workspace...
                </span>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>SSO OAuth 2.0 • TLS 1.3</span>
              <span>Softlan TI © 2026</span>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="max-w-7xl w-full mx-auto flex flex-wrap justify-between items-center text-xs text-slate-500 font-mono">
        <span>Rua João Negrão, 731 • Curitiba - PR</span>
        <span>Uso interno exclusivo • Equipe Técnica Softlan TI</span>
      </footer>
    </div>
  );
}