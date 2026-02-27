import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

export default function UploadSection({ onFileAccepted, xrayPreview, fileName }) {
    const onDrop = useCallback((accepted) => {
        const file = accepted[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => onFileAccepted(file, e.target.result)
        reader.readAsDataURL(file)
    }, [onFileAccepted])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'] },
        maxFiles: 1
    })

    return (
        <div>
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                <input {...getInputProps()} id="xray-upload" />
                {xrayPreview ? (
                    <div>
                        <img src={xrayPreview} alt="X-Ray preview" className="image-preview" />
                        <p style={{ marginTop: 12, fontSize: '14px', color: 'var(--color-green)' }}>
                            ✅ {fileName}
                        </p>
                        <p className="dropzone-hint">Click or drag to replace</p>
                    </div>
                ) : (
                    <>
                        <div className="dropzone-icon">🩻</div>
                        <h3 style={{ fontSize: '18px', marginBottom: 8 }}>
                            {isDragActive ? 'Drop your X-ray here...' : 'Drag & Drop your X-ray image'}
                        </h3>
                        <p style={{ fontSize: '14px' }}>or click to browse files</p>
                        <p className="dropzone-hint">Supported: PNG, JPG, JPEG, WEBP, TIFF up to 16MB</p>
                    </>
                )}
            </div>

            {!xrayPreview && (
                <div style={{ marginTop: 20, padding: '14px 18px', background: 'rgba(99,102,241,0.07)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                    <p style={{ fontSize: '13px', color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span>💡</span>
                        <span>
                            <strong>No X-ray?</strong> You can skip this step — our clinical model will still assess your risk based on the form data alone.
                            The CNN image analysis will use a neutral probability distribution.
                        </span>
                    </p>
                </div>
            )}
        </div>
    )
}
