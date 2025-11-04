import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import type { ConfirmationResult } from "firebase/auth";

const Login: React.FC = () => {
  const [phone, setPhone] = useState("");
  const [dialCode, setDialCode] = useState<"+51" | "+1">("+51");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [conf, setConf] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!recaptchaRef.current || verifierRef.current) return;
    verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
      size: "invisible",
    });
  }, []);

  const sendCode = async () => {
    setError(null);
    try {
      if (!verifierRef.current) return;
      const digits = phone.replace(/\D/g, "");
      const full = phone.startsWith("+") ? phone : `${dialCode}${digits}`;
      const result = await signInWithPhoneNumber(
        auth,
        full,
        verifierRef.current
      );
      setConf(result);
      setStep("code");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "No se pudo enviar el código"
      );
    }
  };

  const confirmCode = async () => {
    setError(null);
    try {
      if (!conf) return;
      await conf.confirm(code);
    } catch {
      setError("Código incorrecto, intenta nuevamente");
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-4">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-green-800">Intu Driver</h1>
        <p className="text-green-700 text-sm">
          Accede con tu número de teléfono
        </p>
      </div>

      <div className="w-full max-w-sm bg-white border border-green-100 rounded-lg p-6 space-y-4 shadow">
        {step === "phone" ? (
          <>
            <p className="text-sm text-green-700">Ingresa tu número</p>
            <div className="flex space-x-2 items-center">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setDialCode("+51")}
                  className={`px-3 py-2 rounded-lg text-sm border ${
                    dialCode === "+51"
                      ? "bg-green-100 text-green-800 border-green-300"
                      : "bg-white text-green-700 border-green-200"
                  }`}
                >
                  +51
                </button>
                <button
                  type="button"
                  onClick={() => setDialCode("+1")}
                  className={`px-3 py-2 rounded-lg text-sm border ${
                    dialCode === "+1"
                      ? "bg-green-100 text-green-800 border-green-300"
                      : "bg-white text-green-700 border-green-200"
                  }`}
                >
                  +1
                </button>
              </div>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={dialCode === "+51" ? "987654321" : "5551234567"}
                className="flex-1 border rounded-md px-3 py-2 border-green-200"
              />
            </div>
            <div ref={recaptchaRef} />
            <Button
              className="w-full bg-green-700 hover:bg-green-800"
              onClick={sendCode}
              disabled={!phone}
            >
              Enviar código
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-green-700">
              Ingresa el código recibido por SMS
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="border rounded-md px-3 py-2 w-full border-green-200"
            />
            <Button
              className="w-full bg-green-700 hover:bg-green-800"
              onClick={confirmCode}
              disabled={!code}
            >
              Verificar
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setStep("phone")}
            >
              Cambiar número
            </Button>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
};

export default Login;
