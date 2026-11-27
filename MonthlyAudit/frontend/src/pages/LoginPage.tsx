import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Activity, Lock } from "lucide-react";
import { HeroShaderCanvas } from "../components/HeroShaderCanvas";
import { SoftlanBrand } from "../components/SoftlanBrand";
import {
  SuperellipseTile,
  IconBitdefenderShield,
  IconProvimentoCnj,
  IconBackupVault,
} from "../components/SoftlanSystemIcons";
import { apiFetch } from "../lib/api";
import type { AppTheme, UserProfile } from "../types/audit";

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

  const savedTheme = (localStorage.getItem("softlan_theme") as AppTheme) || "softlan";
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, [savedTheme]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [6, -6]), {
    stiffness: 180,
    damping: 24,
  });
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-6, 6]), {
    stiffness: 180,
    damping: 24,
  });

  useEffect(() => {
    if (!clientId) return;

    const initGoogle = () => {
      if (!window.google || !googleBtnRef.current) return;
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
  }, [clientId, onSuccess]);

  const handleDevLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/v1/auth/dev-login", {
        method: "POST",
      });
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar no modo local.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex flex-col justify-between px-6 py-8"
      onMouseMove={(e) => {
        mouseX.set(e.clientX - window.innerWidth / 2);
        mouseY.set(e.clientY - window.innerHeight / 2);
      }}
    >
      <HeroShaderCanvas theme={savedTheme} />

      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-7xl w-full mx-auto flex items-center justify-between"
      >
        <SoftlanBrand />

        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full theme-pill text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          TELEMETRIA & AUDITORIA v2.6
        </div>
      </motion.header>

      <main className="relative z-10 max-w-7xl w-full mx-auto grid lg:grid-cols-12 gap-12 items-center my-auto py-10">
        <div className="lg:col-span-7 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full theme-pill theme-accent-text text-xs font-semibold tracking-wider uppercase"
          >
            <Activity className="w-3.5 h-3.5" />
            Governança • Provimento CNJ • Continuidade
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.18 }}
            className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.04] theme-text-primary"
          >
            Auditoria técnica de{" "}
            <span className="theme-accent-text">precisão executiva.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.28 }}
            className="theme-text-muted text-base sm:text-lg max-w-2xl leading-relaxed"
          >
            Consolidação automatizada de chamados GLPI, cronogramas de adequação ao Provimento CNJ,
            telemetria de endpoints Bitdefender GravityZone e auditoria de backups em nuvem em um
            único dossiê PDF padronizado.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.38 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 max-w-xl"
          >
            {[
              {
                Icon: IconBitdefenderShield,
                tone: "emerald" as const,
                label: "GravityZone",
                sub: "Segurança Ativa",
              },
              {
                Icon: IconProvimentoCnj,
                tone: "accent" as const,
                label: "Provimento CNJ",
                sub: "Trilha Auditável",
              },
              {
                Icon: IconBackupVault,
                tone: "sky" as const,
                label: "Backblaze & Zabbix",
                sub: "SLA Contínuo",
              },
            ].map((item) => (
              <div key={item.label} className="squircle-card p-4 flex items-center gap-3.5">
                <SuperellipseTile size="sm" tone={item.tone}>
                  <item.Icon className="w-5 h-5" />
                </SuperellipseTile>
                <div>
                  <div className="text-xs font-bold">{item.label}</div>
                  <div className="text-[11px] theme-text-muted">{item.sub}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          style={{ rotateX, rotateY, transformPerspective: 1100 }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.22 }}
          className="lg:col-span-5"
        >
          <div className="squircle-card p-8 sm:p-10 relative overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-mono theme-accent-text uppercase tracking-widest mb-3">
              <Lock className="w-3.5 h-3.5" />
              Acesso Corporativo Restrito
            </div>

            <h2 className="text-2xl font-bold mb-2">Portal de Auditoria</h2>
            <p className="text-sm theme-text-muted mb-8">
              Autentique-se utilizando sua conta institucional{" "}
              <span className="font-semibold theme-text-primary">@softlanti.com.br</span> ou
              credencial Root autorizada no Google Workspace.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 py-5 px-4 rounded-2xl theme-pill">
              {clientId && (
                <div ref={googleBtnRef} className="min-h-[44px] flex items-center justify-center" />
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handleDevLogin}
                className="w-full py-3 px-5 rounded-full theme-accent-bg font-bold text-sm transition cursor-pointer disabled:opacity-50"
              >
                Entrar no Ambiente Local (Modo Teste)
              </button>

              {loading && (
                <span className="mt-1 text-xs font-mono theme-accent-text animate-pulse">
                  Validando credenciais...
                </span>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="mt-8 pt-5 border-t border-current/10 flex items-center justify-between text-[11px] theme-text-muted font-mono">
              <span>SSO OAuth 2.0 • TLS 1.3</span>
              <span>© 2026 Gustavo Prestes</span>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 max-w-7xl w-full mx-auto pt-4 border-t border-current/10 flex flex-wrap justify-between items-center gap-2 text-xs theme-text-muted font-mono">
        <span>© 2026 Gustavo Prestes • Todos os direitos reservados.</span>
        <span>Desenvolvido e mantido por Gustavo Prestes</span>
      </footer>
    </div>
  );
}