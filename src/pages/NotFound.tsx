import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-2 text-6xl font-bold text-primary">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">Page introuvable</p>
        <p className="mb-6 text-sm text-muted-foreground">
          La page <code className="bg-muted-foreground/10 px-2 py-1 rounded">{location.pathname}</code> n'existe pas.
        </p>
        <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
