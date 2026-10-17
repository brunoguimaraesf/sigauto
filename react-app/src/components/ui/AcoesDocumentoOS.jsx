import { useEffect, useState } from 'react'
import { FileText, Printer } from 'lucide-react'
import { useDatabase } from '../../hooks/useDatabase'
import { resolveEquipe } from '../../utils/osFinance'
import { carregarLogoDataUrl, criarUrlDocumentoOS, imprimirDocumentoOS } from '../../utils/osPdf'
import { VisualizadorDocumentoOS } from './VisualizadorDocumentoOS'
import css from './AcoesDocumentoOS.module.css'

// "Visualizar PDF" e "Imprimir" da O.S. (RF05), em qualquer status. As duas
// acoes montam o mesmo documento pelo gerador unico de utils/osPdf.js.
// Visualizar abre o PDF num visualizador dentro da propria pagina, com baixar e
// imprimir ali mesmo: a nova guia dependia de pop-up e o navegador bloqueava.
//
// `extra` permite gerar a previa com os valores ainda nao confirmados na tela
// de encerramento; depois do fechamento, esses campos ja vem persistidos na OS.
export function AcoesDocumentoOS({ os, cliente, veiculo, extra = {}, compacto = false }) {
  const { oficina, carregandoOficina, erroOficina, funcionarios, baixarLogoOficina } = useDatabase()
  const [ocupado, setOcupado] = useState(null) // 'visualizar' | 'imprimir' | null
  const [erro, setErro] = useState('')
  const [documento, setDocumento] = useState(null) // { url, nomeArquivo, revogar, dados }

  // Desmontar a tela com o visualizador aberto (navegacao, encerramento da OS)
  // tambem tem de liberar a URL temporaria.
  useEffect(() => () => documento?.revogar?.(), [documento])

  const fecharVisualizador = () => {
    documento?.revogar?.()
    setDocumento(null)
  }

  const montarDados = async () => {
    const logoDataUrl = await carregarLogoDataUrl(baixarLogoOficina, oficina.logo_path)
    return {
      os,
      cliente: cliente || {},
      veiculo: veiculo || {},
      equipe: resolveEquipe(os, funcionarios || []),
      oficina,
      logoDataUrl,
      emitidoEm: new Date(),
      ...extra,
    }
  }

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
      const dados = await montarDados()
      if (acao === 'visualizar') {
        fecharVisualizador()
        setDocumento({ ...criarUrlDocumentoOS(dados), dados })
      } else await imprimirDocumentoOS(dados)
    } catch (err) {
      setErro(`Não foi possível gerar o documento: ${err?.message || 'erro desconhecido.'}`)
    } finally {
      setOcupado(null)
    }
  }

  // Imprimir de dentro do visualizador reaproveita o documento ja montado, sem
  // baixar a logomarca outra vez.
  const imprimirDoVisualizador = async () => {
    setErro('')
    setOcupado('imprimir')
    try {
      await imprimirDocumentoOS(documento.dados)
    } catch (err) {
      setErro(`Não foi possível imprimir o documento: ${err?.message || 'erro desconhecido.'}`)
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
      {documento && (
        <VisualizadorDocumentoOS
          url={documento.url}
          nomeArquivo={documento.nomeArquivo}
          onFechar={fecharVisualizador}
          onImprimir={imprimirDoVisualizador}
          imprimindo={ocupado === 'imprimir'}
        />
      )}
    </div>
  )
}
