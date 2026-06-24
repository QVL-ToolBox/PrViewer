import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0067b8' }, // bleu Azure DevOps
    background: {
      default: '#f3f5f8',
      paper: '#ffffff',
    },
    text: {
      primary: '#1b1f27',
      secondary: '#5a6473',
    },
    divider: '#e3e7ee',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: { borderBottom: '1px solid #e3e7ee', backgroundColor: '#ffffff' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid #e3e7ee' },
      },
    },
  },
})
