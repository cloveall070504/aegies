"""add quiz question qtype and open-answer support

Revision ID: 9a1b2c3d4e5f
Revises: 8f3b2c1d4e5a
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa


revision = '9a1b2c3d4e5f'
down_revision = '8f3b2c1d4e5a'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('quiz_questions', sa.Column('qtype', sa.String(16), server_default='choice', nullable=False))
    op.add_column('quiz_questions', sa.Column('answer_seq', sa.String(256), server_default='', nullable=False))
    op.add_column('quiz_questions', sa.Column('answer_text', sa.String(2048), server_default='', nullable=False))


def downgrade():
    op.drop_column('quiz_questions', 'answer_text')
    op.drop_column('quiz_questions', 'answer_seq')
    op.drop_column('quiz_questions', 'qtype')
