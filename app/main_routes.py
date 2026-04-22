import os
import uuid
from pathlib import Path

from flask import Blueprint, current_app, flash, jsonify, redirect, render_template, request, send_file, url_for
from flask_login import current_user, login_required
from werkzeug.utils import secure_filename

from . import db
from .models import Attachment, Note

main_bp = Blueprint("main", __name__)


@main_bp.route("/dashboard")
@login_required
def dashboard():
    notes = Note.query.filter_by(user_id=current_user.id).order_by(Note.updated_at.desc()).all()
    return render_template("dashboard.html", notes=notes)


@main_bp.route("/notes/create", methods=["POST"])
@login_required
def create_note():
    title = request.form.get("title", "").strip()
    encrypted_content = request.form.get("encrypted_content", "").strip()
    salt = request.form.get("salt", "").strip()
    nonce = request.form.get("nonce", "").strip()

    if not title or not encrypted_content or not salt or not nonce:
        flash("Title and encrypted note payload are required.", "error")
        return redirect(url_for("main.dashboard"))

    note = Note(
        user_id=current_user.id,
        title=title,
        encrypted_content=encrypted_content,
        salt=salt,
        nonce=nonce,
    )
    db.session.add(note)
    db.session.commit()
    flash("Encrypted note saved.", "success")
    return redirect(url_for("main.dashboard"))


@main_bp.route("/notes/<int:note_id>/delete", methods=["POST"])
@login_required
def delete_note(note_id: int):
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first_or_404()

    for attachment in note.attachments:
        file_path = Path(current_app.config["UPLOAD_FOLDER"]) / f"user_{current_user.id}" / attachment.stored_filename
        if file_path.exists():
            file_path.unlink()

    db.session.delete(note)
    db.session.commit()
    flash("Note deleted.", "success")
    return redirect(url_for("main.dashboard"))


@main_bp.route("/attachments/upload/<int:note_id>", methods=["POST"])
@login_required
def upload_attachment(note_id: int):
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first_or_404()
    file = request.files.get("attachment")
    file_nonce = request.form.get("file_nonce", "").strip()
    file_salt = request.form.get("file_salt", "").strip()
    original_filename = secure_filename(request.form.get("original_filename", "").strip())

    if not file or not file.filename:
        flash("Choose a file to upload.", "error")
        return redirect(url_for("main.dashboard"))

    if not file_nonce or not file_salt or not original_filename:
        flash("Encrypted attachment metadata is missing.", "error")
        return redirect(url_for("main.dashboard"))

    user_folder = Path(current_app.config["UPLOAD_FOLDER"]) / f"user_{current_user.id}"
    user_folder.mkdir(parents=True, exist_ok=True)

    ext = ".enc"
    stored_filename = f"{uuid.uuid4().hex}{ext}"
    save_path = user_folder / stored_filename
    file.save(save_path)

    attachment = Attachment(
        note_id=note.id,
        user_id=current_user.id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        mime_type=file.mimetype,
        file_size=os.path.getsize(save_path),
        file_nonce=file_nonce,
        file_salt=file_salt,
    )
    db.session.add(attachment)
    db.session.commit()

    flash("Encrypted attachment uploaded.", "success")
    return redirect(url_for("main.dashboard"))


@main_bp.route("/attachments/<int:attachment_id>/download")
@login_required
def download_attachment(attachment_id: int):
    attachment = Attachment.query.filter_by(id=attachment_id, user_id=current_user.id).first_or_404()
    file_path = Path(current_app.config["UPLOAD_FOLDER"]) / f"user_{current_user.id}" / attachment.stored_filename
    if not file_path.exists():
        flash("Attachment file is missing on disk.", "error")
        return redirect(url_for("main.dashboard"))

    return send_file(
        file_path,
        as_attachment=True,
        download_name=attachment.stored_filename,
        mimetype="application/octet-stream",
    )


@main_bp.route("/attachments/<int:attachment_id>/meta")
@login_required
def attachment_meta(attachment_id: int):
    attachment = Attachment.query.filter_by(id=attachment_id, user_id=current_user.id).first_or_404()
    return jsonify(
        {
            "id": attachment.id,
            "original_filename": attachment.original_filename,
            "stored_filename": attachment.stored_filename,
            "file_nonce": attachment.file_nonce,
            "file_salt": attachment.file_salt,
            "mime_type": attachment.mime_type or "application/octet-stream",
            "file_size": attachment.file_size or 0,
            "download_url": url_for("main.download_attachment", attachment_id=attachment.id),
        }
    )
