
"use client";

import { useState, type FormEvent } from "react";

type Mensagem = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviarMensagem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const mensagem = texto.trim();
    if (!mensagem || carregando) return;

    setMensagens((atual) => [
      ...atual,
      { role: "user", content: mensagem },
    ]);
    setTexto("");
    setCarregando(true);

    try {
      const resposta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Erro na IA");
      }

      setMensagens((atual) => [
        ...atual,
        { role: "assistant", content: dados.resposta },
      ]);
    } catch {
      setMensagens((atual) => [
        ...atual,
        {
          role: "assistant",
          content: "Erro ao conectar com a IA. Verifique o Ollama.",
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#101010] text-white">
      <header className="border-b border-white/10 p-6">
        <h1 className="text-2xl font-bold">
          BARBER ASSISTANT AI
        </h1>
        <p className="text-sm text-neutral-400">
          Central inteligente de atendimento
        </p>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-5">
        {mensagens.length === 0 && (
          <div className="mt-20 text-center">
            <h2 className="text-2xl font-semibold">
              Seu assistente está pronto.
            </h2>
            <p className="mt-3 text-neutral-400">
              Pergunte sobre atendimento e gestão de barbearias.
            </p>
          </div>
        )}

        {mensagens.map((msg, index) => (
          <div
            key={index}
            className={
              msg.role === "user"
                ? "ml-auto max-w-[85%] rounded-xl bg-neutral-700 p-4 whitespace-pre-wrap"
                : "max-w-[85%] rounded-xl border border-white/10 bg-neutral-900 p-4 whitespace-pre-wrap"
            }
          >
            {msg.content}
          </div>
        ))}

        {carregando && (
          <p className="text-sm text-emerald-400">
            Barber Assistant AI está pensando...
          </p>
        )}
      </section>

      <form
        onSubmit={enviarMensagem}
        className="mx-auto flex w-full max-w-3xl gap-3 p-5"
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite sua mensagem..."
          maxLength={4000}
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-neutral-900 px-4 py-3 outline-none"
        />
        <button
          type="submit"
          disabled={carregando || !texto.trim()}
          className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </main>
  );
}
