import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modal}>
        {children}
      </div>
    </div>
  );
};


const modalStyles = {
  overlay: {
    position: 'absolute' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
     backgroundColor: 'rgba(0, 0, 0, 0.5)',
     display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    gap: '8px',
    borderRadius: '32px',
    opacity: '0px',
    border: '1.2px solid #697ECD',
    backgroundColor: '#100D11',
    padding: '20px',
    // width: '950px',
    maxWidth: '100%',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    zoom: '0.9',
  },
  closeButton: {
    position: 'absolute' as 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
  },
};

export default Modal;
