interface PhotoLightboxProps {
    imageUrl: string;
    onClose: () => void;
}

export default function PhotoLightbox({ imageUrl, onClose }: PhotoLightboxProps) {
    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.9)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'zoom-out'
            }}
            onClick={onClose}
        >
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: 20, right: 20,
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: 32,
                    cursor: 'pointer',
                    padding: 10
                }}
            >
                ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt="Aperçu justificatif"
                style={{
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                    objectFit: 'contain'
                }}
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}
