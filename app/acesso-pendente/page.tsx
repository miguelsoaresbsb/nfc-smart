import Link from "next/link";

export default function AccessPending() {
  return (
    <main className="min-h-screen grid place-items-center bg-[#05070a] px-5">
      <div className="glass w-full max-w-lg rounded-3xl p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-xl">N</div>
        <h1 className="mt-6 text-3xl font-semibold">Acesso aguardando autorização</h1>
        <p className="mt-3 leading-7 text-white/55">
          Seu pedido foi recebido. O administrador do NFC Smart precisa autorizar
          seu acesso antes que você possa entrar no painel.
        </p>
        <Link href="/login" className="mt-7 inline-block rounded-xl bg-white px-5 py-3 font-semibold text-black">
          Voltar para o login
        </Link>
      </div>
    </main>
  );
}
