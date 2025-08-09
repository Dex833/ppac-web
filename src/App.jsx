import { Routes, Route, Link } from 'react-router-dom'

export default function App() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>PPAC Web (Fresh)</h1>
        <p>Deployed via GitHub → Firebase App Hosting ✅</p>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/">Home</Link>
          <Link to="/login">Login</Link>
          <Link to="/signup">Signup</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}

function Home() { return <h2>Home Page</h2> }
function Login() { return <h2>Login Page (placeholder)</h2> }
function Signup() { return <h2>Signup Page (placeholder)</h2> }
function Dashboard() { return <h2>Member Dashboard (placeholder)</h2> }
function NotFound() { return <h2>404 — Page Not Found</h2> }
