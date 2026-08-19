/**
 * 共享文档上传逻辑 hook（PC / Mobile 通用）
 * 负责：列出文档、上传并解析、查看风险抽取结果。归属当前全局场景。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDoc, getDocRisks, listDocs, uploadDoc } from '../api'
import { useSceneType } from './useSceneType'

export function useDocs() {
  const themeScene = useSceneType()
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [riskDocId, setRiskDocId] = useState(null)
  const [risks, setRisks] = useState([])
  const fileRef = useRef(null)

  const load = useCallback(() => {
    listDocs().then(setDocs).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      setError('')
      try {
        const data = await uploadDoc(file, themeScene)
        load()
        setRiskDocId(data.doc_id)
        setRisks(data.risks || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [themeScene, load]
  )

  const showRisks = useCallback(async (docId) => {
    setError('')
    try {
      const data = await getDocRisks(docId)
      setRiskDocId(docId)
      setRisks(data.risks || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const onDelete = useCallback(
    async (docId) => {
      setError('')
      try {
        await deleteDoc(docId)
        if (riskDocId === docId) {
          setRiskDocId(null)
          setRisks([])
        }
        load()
      } catch (err) {
        setError(err.message)
      }
    },
    [riskDocId, load]
  )

  return {
    docs, uploading, error, riskDocId, risks, fileRef,
    onUpload, showRisks, onDelete,
  }
}
