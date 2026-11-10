import "./setup-progress.css";

const steps = ["Cadastro", "Aprovação", "Assinatura", "Página ativa"];
export default function SetupProgress({ step, complete = false, rejected = false }: { step: 0 | 1 | 2 | 3; complete?: boolean; rejected?: boolean }) {
  return <ol className="setup-progress" aria-label="Etapas para ativar sua página">
    {steps.map((label, index) => {
      const done = complete || index < step;
      const current = index === step && !complete;
      return <li key={label} className={done ? "is-done" : current ? rejected ? "is-current is-rejected" : "is-current" : ""} aria-current={current ? "step" : undefined}>
        <span className="setup-progress-number" aria-hidden="true">{done ? "✓" : index + 1}</span>
        <span>{label}<small>{done ? "Concluído" : current ? rejected ? "Não aprovado" : "Etapa atual" : "Próxima etapa"}</small></span>
      </li>;
    })}
  </ol>;
}
