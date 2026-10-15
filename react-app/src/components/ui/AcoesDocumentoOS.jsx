import { useState } from 'react'
import { FileText, Printer } from 'lucide-react'
import { useDatabase } from '../../hooks/useDatabase'
import { resolveEquipe } from '../../utils/osFinance'
import { abrirDocumentoOS, carregarLogoDataUrl, imprimirDocumentoOS } from '../../utils/osPdf'
import css from './AcoesDocumentoOS.module.css'

// "Visualizar PDF" e "Imprimir" da O.S. (RF05), em qualquer status. As duas
// acoes montam o mesmo documento pelo gerador unico de utils/osPdf.js.
// Visualizar abre o PDF numa nova guia (o visualizador do navegador ja oferece
// salvar e imprimir) em vez de baixar o arquivo direto.
//
// `extra` repassa ao gerador o que so existe na tela de encerramento:
// desconto escolhido, forma de pagamento e observacoes finais ainda nao salvas.
export function AcoesDocumentoOS({ os, cliente, veiculo, extra = {}, compacto = false }) {
  const { oficina, carregandoOficina, erroOficina, funcionarios, baixarLogoOficina } = useDatabase()
  const [ocupado, setOcupado] = useState(null) // 'visualizar' | 'imprimir' | null
  const [erro, setErro] = useState('')

  const executar = async (acao) => {
    setErro('')
    if (!oficina) {
      setErro(erroOficina
        ? `Os dados da oficina não puderam ser carregados (${erroOficina}). Tente novamente mais tarde.`
        : 'Os dados da oficina ainda não foram cadastrados. O gestor deve preenchê-los no menu Oficina.')
      return
    }
    setOcupado(acao)
    try {
      const logoDataUrl = await carregarLogoDataUrl(baixarLogoOficina, oficina.logo_path)
      const dados = {
        os,
        cliente: cliente || {},
        veiculo: veiculo || {},
        equipe: resolveEquipe(os, funcionarios || []),
        oficina,
        logoDataUrl,
        emitidoEm: new Date(),
        ...extra,
      }
      if (acao === 'visualizar') abrirDocumentoOS(dados)
      else await imprimirDocumentoOS(dados)
    } catch (err) {
      setErro(`Não foi possível gerar o documento: ${err?.message || 'erro desconhecido.'}`)
    } finally {
      setOcupado(null)
    }
  }

  const classeBotao = `btn-secondary ${css.btn}${compacto ? ` ${css.btnCompacto}` : ''}`
  const desabilitado = Boolean(ocupado) || carregandoOficina

  return (
    <div className={css.acoes}>
      <div className={css.grupo}>
        <button type="button" className={classeBotao} onClick={() => executar('visualizar')} disabled={desabilitado}>
          <FileText size={15} /> {ocupado === 'visualizar' ? 'Gerando...' : 'Visualizar PDF'}
        </button>
        <button type="button" className={classeBotao} onClick={() => executar('imprimir')} disabled={desabilitado}>
          <Printer size={15} /> {ocupado === 'imprimir' ? 'Preparando...' : 'Imprimir'}
        </button>
      </div>
      {erro && (
        <span role="alert" className={css.erro}>
          {erro}
        </span>
      )}
    </div>
  )
}
