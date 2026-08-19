"""add critic_divergence to operation_records

让推演记录落库时保存「模型 Critic 与规则引擎是否存在分歧」标记，
使历史复核页(InferReview)能与实时推演页(Sandbox/ScenarioInfer/Mobile)
一致地展示分歧状态，避免「实时黄、历史绿」的对冲观感。

Revision ID: 7c8d9e0f1a2b
Revises: 5da321844ace
Create Date: 2026-08-17 11:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c8d9e0f1a2b'
down_revision: Union[str, Sequence[str], None] = '5da321844ace'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite 对 ADD COLUMN NOT NULL 需要 server_default，Postgres 同样兼容。
    op.add_column(
        'operation_records',
        sa.Column('critic_divergence', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('operation_records', 'critic_divergence')
