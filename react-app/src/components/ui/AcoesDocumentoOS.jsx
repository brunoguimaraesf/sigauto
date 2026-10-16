import { useState } from 'react'
import { FileText, Printer } from 'lucide-react'
import { useDatabase } from '../../hooks/useDatabase'
import { resolveEquipe } from '../../utils/osFinance'
import { abrirDocumentoOS, carregarLogoDataUrl, imprimirDocumentoOS, reservarGuiaDocumento, salvarDocumentoOS } from '../../utils/osPdf'
import css from './AcoesDocumentoOS.module.css'

// "Visualizar PDF" e "Imprimir" da O.S. (RF05), em qualquer status. As duas
// acoes montam o mesmo documento pelo gerador unico de utils/osPdf.js.
// Visualizar abre o PDF numa nova guia (o visualizador do navegador ja oferece
// salvar e imprimir) em vez de baixar o arquivo direto.
//
// `extra` permite gerar a previa com os valores ainda nao confirmados na tela
// de encerramento; depois do fechamento, esses campos ja vem persistidos na OS.
export function AcoesDocumentoOS({ os, cliente, veiculo, extra = {}, compacto = false }) {
  const { oficina, carregandoOficina, erroOficina, funcionarios, baixarLogoOficina } = useDatabase()
  const [ocupado, setOcupado] = useState(null) // 'visualizar' | 'imprimir' | null
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const executar = async (acao) => {
    setErro('')
    setAviso('')
    if (!oficina) {
      setErro(erroOficina
        ? `Os dados da oficina não puderam ser carregados (${erroOficina}). Tente novamente mais tarde.`
        : 'Os dados da oficina ainda não foram cadastrados. O gestor deve preenchê-los no menu Oficina.')
      return
    }
    const guiaReservada = acao === 'visualizar' ? reservarGuiaDocumento() : null
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
      if (acao === 'visualizar' && guiaReservada) abrirDocumentoOS(dados, window, guiaReservada)
      else if (acao === 'visualizar') {
        await salvarDocumentoOS(dados)
        setAviso('A nova guia foi bloqueada; o PDF foi salvo no dispositivo.')
      } else await imprimirDocumentoOS(dados)
    } catch (err) {
      guiaReservada?.close?.()
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
      {aviso && <span role="status" className={css.aviso}>{aviso}</span>}
    </div>
  )
}
