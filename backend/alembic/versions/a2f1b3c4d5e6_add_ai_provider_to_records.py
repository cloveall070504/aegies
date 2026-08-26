"""add ai_provider to operation_records

让推演记录落库时保存「本次使用的 AI 引擎」（cloud=千问云端 / ollama=本地 / 空=纯规则），
使历史复核页(Sandbox/InferReview)能与实时推演页一致地展示引擎标签，
避免「实时显示千问云端、历史却误标 Ollama 增强」的对冲观感。

Revision ID: a2f1b3c4d5e6
Revises: a1b2c3d4e5f7
Create Date: 2026-08-25 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2f1b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'operation_records',
        sa.Column('ai_provider', sa.String(16), nullable=False, server_default=''),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('operation_records', 'ai_provider')
