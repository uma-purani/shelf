import { useNavigate } from 'react-router-dom'

/**
 * Back that never leaves the app: opened directly (e.g. from a home-screen shortcut)
 * there is no previous page in our history, so land on Home instead.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate()
  return () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }))
}
