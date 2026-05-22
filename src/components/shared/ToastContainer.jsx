import { useApp } from '../../store/appStore.jsx';
import { useEffect } from 'react';

export default function ToastContainer() {
  const { state, dispatch } = useApp();
  const { notifications } = state;

  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATIONS' }), 4000);
    return () => clearTimeout(timer);
  }, [notifications]);

  if (!notifications.length) return null;

  return (
    <div className="toast-container">
      {notifications.slice(0, 3).map(n => (
        <div key={n.id} className={`toast ${n.type}`}>
          {n.message}
        </div>
      ))}
    </div>
  );
}
