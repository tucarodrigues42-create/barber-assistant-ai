import { NextResponse } from "next/server";
import ollama from "ollama";

export async function POST(request: Request) {
  try {
    const { mensagem } = await request.json();

    if (
      typeof mensagem !== "string" ||
      !mensagem.trim() ||
      mensagem.length > 4000
    ) {
      return NextResponse.json(
        { erro: "Mensagem inválida" },
        { status: 400 }
      );
    }

    const resultado = await ollama.chat({
      model: "qwen2.5:3b",
      messages: [
        {
          role: "system",
          content: `Você é o Barber Assistant AI.
          Um assistente especializado em atendimento
          para barbearias.

          Responda sempre em português.
          Seja profissional, educado e objetivo.
          Ajude com dúvidas sobre serviços,
          cortes, barbas e agendamentos.

          Nunca invente preços, horários ou
          disponibilidade de agendamento.`
        },
        {
          role: "user",
          content: mensagem
        }
      ]
    });

    return NextResponse.json({
      resposta: resultado.message.content
    });

  } catch (error) {
    console.error("Erro na IA:", error);

    return NextResponse.json(
      { erro: "Não foi possível consultar a IA." },
      { status: 500 }
    );
  }
}