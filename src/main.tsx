import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// Create a React Query client with sensible defaults for research platform
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoid unnecessary refetches during experiments
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Get the root element from the DOM
const rootElement = document.getElementById('root')

// Ensure root element exists before rendering
if (!rootElement) {
  throw new Error('Root element not found. Check your index.html file.')
}

// Render the app with all providers
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
