import { useEffect, useRef, useState } from 'react'
import { Download, Printer, X } from 'lucide-react'
import css from './VisualizadorDocumentoOS.module.css'

// Tempo que o visualizador espera o iframe renderizar antes de sugerir o
// download. Navegador sem visualizador de PDF embutido (iOS antigo, WebView de
// aplicativo) nao dispara `load`, e a tela ficaria num retangulo vazio sem
// explicacao nenhuma.
const ESPERA_RENDER_MS = 2500

// Visualizador do documento da O.S. DENTRO da pagina (RF05). Nao usa
// `window.open`: o bloqueio de pop-ups do site — ligado por padrao no Safari do
// iPhone — matava a nova guia e a tela caia no download, que o usuario nao
// pediu. O iframe recebe a mesma URL de blob que o botao de baixar.
export function VisualizadorDocumentoOS({ url, nomeArquivo, onFechar, onImprimir, imprimindo = false }) {
  const [carregado, setCarregado] = useState(false)
  const [demorou, setDemorou] = useState(false)
  const btnFecharRef = useRef(null)

  useEffect(() => {
    btnFecharRef.current?.focus()
    const temporizador = setTimeout(() => setDemorou(true), ESPERA_RENDER_MS)
    return () => clearTimeout(temporizador)
  }, [])

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className={`modal-content ${css.modal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Documento da ordem de serviço"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{nomeArquivo}</h3>
          <button
            type="button"
            ref={btnFecharRef}
            className={css.btnFechar}
            onClick={onFechar}
            aria-label="Fechar visualizador"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`modal-body ${css.corpo}`}>
          <iframe
            className={css.quadro}
            src={url}
            title="Documento da ordem de serviço"
            onLoad={() => setCarregado(true)}
          />
          {!carregado && demorou && (
            <p role="status" className={css.aviso}>
              Este navegador não exibe PDF na própria página. Use <strong>Baixar PDF</strong> para
              abrir o arquivo no aplicativo de documentos do aparelho.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <a className={`btn-secondary ${css.btn}`} href={url} download={nomeArquivo}>
            <Download size={15} /> Baixar PDF
          </a>
          <button type="button" className={`btn-secondary ${css.btn}`} onClick={onImprimir} disabled={imprimindo}>
            <Printer size={15} /> {imprimindo ? 'Preparando...' : 'Imprimir'}
          </button>
          <button type="button" className="btn-primary" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
